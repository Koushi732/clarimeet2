import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketStatus } from '../hooks/useWebSocket';
import { WebSocketMessage, WebSocketMessageType } from './WebSocketContextBridge';

// Define the context type
interface RealWebSocketContextType {
  sendMessage: (type: WebSocketMessageType, data: any) => void;
  lastMessage: WebSocketMessage | null;
  connectionStatus: WebSocketStatus;
  clientId: string;
  addMessageHandler: (type: WebSocketMessageType, handler: (data: any) => void) => () => void;
  reconnect: () => void;
  connectToSession: (sessionId: string) => void;
  isConnectedToSession: boolean;
  currentSessionId: string | null;
  connectionError: string | null;
}

// Create the context
const RealWebSocketContext = createContext<RealWebSocketContextType | null>(null);

// Generate a unique client ID that persists between reconnections
const generateClientId = () => {
  // Check if we have an existing ID in local storage
  const storedId = localStorage.getItem('clarimeet_ws_client_id');
  if (storedId) {
    return storedId;
  }
  
  // Generate and store a new ID
  const newId = uuidv4();
  localStorage.setItem('clarimeet_ws_client_id', newId);
  return newId;
};

interface RealWebSocketProviderProps {
  children: React.ReactNode;
  sessionId?: string;
}

export const RealWebSocketProvider: React.FC<RealWebSocketProviderProps> = ({ 
  children, 
  sessionId: initialSessionId 
}) => {
  // Connection state
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketStatus>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [isConnectedToSession, setIsConnectedToSession] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId || null);
  
  // Client identifier
  const [clientId] = useState<string>(generateClientId());
  
  // Message handlers registry
  const messageHandlers = useRef<Map<WebSocketMessageType, Set<(data: any) => void>>>(
    new Map()
  );
  
  // Connection attempt counter for exponential backoff
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Reconnection timer
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Heartbeat for connection monitoring
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Create a new WebSocket connection
  const connect = useCallback(() => {
    try {
      // Clear any existing reconnect timer
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      
      // Update connection status
      setConnectionStatus('connecting');
      setConnectionError(null);
      
      // Get the WebSocket URL from environment or default to localhost
      // Try to determine if we're in Electron or browser and adjust accordingly
      let wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
      
      // If we're in development and not in Electron, ensure we're connecting to the right port
      // This handles the case where the React app is served from a different port than the backend
      if (process.env.NODE_ENV === 'development' && !(window as any).electron) {
        // Extract the hostname from the current URL
        const currentLocation = window.location.hostname;
        wsUrl = `ws://${currentLocation}:8000`;
        console.log('Using development WebSocket URL:', wsUrl);
      }
      
      // Determine the proper WebSocket endpoint based on whether we have a session ID
      let wsEndpoint = '/ws/system/status';
      if (currentSessionId) {
        // For audio streaming and real-time transcription, use the dedicated endpoint
        wsEndpoint = `/ws/transcription/${currentSessionId}/live`;
      }
      
      // Create a new WebSocket connection with the appropriate endpoint
      const newSocket = new WebSocket(`${wsUrl}${wsEndpoint}?client_id=${clientId}`);
      
      // Maintain a second connection for audio streaming if we have a session
      if (currentSessionId) {
        try {
          // This connection will be managed separately and used only for sending audio chunks
          const audioStreamUrl = `${wsUrl}/ws/audio/${currentSessionId}/stream?client_id=${clientId}`;
          console.log(`Setting up audio streaming connection to ${audioStreamUrl}`);
          
          // We don't need to track this connection as it's only used by the audio context
          localStorage.setItem('clarimeet_audio_ws_url', audioStreamUrl);
        } catch (error) {
          console.error('Error preparing audio streaming URL:', error);
        }
      }
      
      console.log(`Connecting to WebSocket at ${wsUrl}${wsEndpoint} with client ID ${clientId}`);
      
      // Setup event handlers
      newSocket.onopen = () => {
        console.log('WebSocket connection established');
        setConnectionStatus('open');
        reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
        
        // Setup heartbeat to keep connection alive
        heartbeatInterval.current = setInterval(() => {
          if (newSocket.readyState === WebSocket.OPEN) {
            newSocket.send(JSON.stringify({ type: 'ping', data: { client_id: clientId } }));
          }
        }, 30000); // Send heartbeat every 30 seconds
        
        // If we have a session ID, connect to it immediately
        if (currentSessionId) {
          connectToSession(currentSessionId);
        }
      };
      
      newSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(message);
          
          // Process message based on type
          const handlersForType = messageHandlers.current.get(message.type);
          if (handlersForType) {
            handlersForType.forEach(handler => {
              try {
                handler(message.data);
              } catch (handlerError) {
                console.error('Error in message handler:', handlerError);
              }
            });
          }
          
          // Handle special message types
          if (message.type === 'session_update' && message.data?.session_id) {
            setCurrentSessionId(message.data.session_id);
            setIsConnectedToSession(true);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
      
      newSocket.onclose = (event) => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        setConnectionStatus('closed');
        setIsConnectedToSession(false);
        
        // Clear heartbeat interval
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
          heartbeatInterval.current = null;
        }
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimer.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          setConnectionError('Maximum reconnection attempts reached. Please refresh the page.');
        }
      };
      
      newSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('Connection error occurred. Attempting to reconnect...');
      };
      
      // Store the socket reference
      setSocket(newSocket);
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
      setConnectionError(`Failed to create connection: ${error}`);
      
      // Attempt to reconnect
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    }
  }, [clientId, currentSessionId]);
  
  // Send a message through the WebSocket
  const sendMessage = useCallback((type: WebSocketMessageType, data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        const message = {
          type,
          data: {
            ...data,
            client_id: clientId
          }
        };
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('Cannot send message: WebSocket is not open');
    }
  }, [socket, clientId]);
  
  // Register a message handler
  const addMessageHandler = useCallback((type: WebSocketMessageType, handler: (data: any) => void) => {
    if (!messageHandlers.current.has(type)) {
      messageHandlers.current.set(type, new Set());
    }
    
    const handlers = messageHandlers.current.get(type)!;
    handlers.add(handler);
    
    // Return a function to remove this handler
    return () => {
      const handlersSet = messageHandlers.current.get(type);
      if (handlersSet) {
        handlersSet.delete(handler);
        if (handlersSet.size === 0) {
          messageHandlers.current.delete(type);
        }
      }
    };
  }, []);
  
  // Connect to a specific session
  const connectToSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    
    // Close the existing socket if open
    if (socket) {
      socket.close();
    }
    
    // We'll create a new connection specifically for this session
    reconnectAttempts.current = 0;
    connect(); // This will use the new sessionId
    
    // Set as not connected until the new socket is open
    setIsConnectedToSession(false);
  }, [socket, connect]);
  
  // Reconnect the WebSocket
  const reconnect = useCallback(() => {
    if (socket) {
      socket.close();
    }
    reconnectAttempts.current = 0;
    connect();
  }, [socket, connect]);
  
  // Initialize the WebSocket connection
  useEffect(() => {
    connect();
    
    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.close();
      }
      
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [connect]);
  
  // Connect to initial session if provided
  useEffect(() => {
    if (initialSessionId && socket && socket.readyState === WebSocket.OPEN) {
      connectToSession(initialSessionId);
    }
  }, [initialSessionId, socket, connectToSession]);
  
  // Context value
  const contextValue = {
    sendMessage,
    lastMessage,
    connectionStatus,
    clientId,
    addMessageHandler,
    reconnect,
    connectToSession,
    isConnectedToSession,
    currentSessionId,
    connectionError,
    connected: connectionStatus === 'open'
  };
  
  return (
    <RealWebSocketContext.Provider value={contextValue}>
      {children}
    </RealWebSocketContext.Provider>
  );
};

// Hook to use the WebSocket context
export const useRealWebSocket = () => {
  const context = useContext(RealWebSocketContext);
  if (!context) {
    throw new Error('useRealWebSocket must be used within a RealWebSocketProvider');
  }
  return context;
};
