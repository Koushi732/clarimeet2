import React, { createContext, useContext, useEffect, useState, useRef, useCallback, FC, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { io, Socket } from 'socket.io-client';
import { WebSocketStatus } from '../hooks/useWebSocket';
import { WebSocketMessage, WebSocketMessageType, MessageTypes } from './WebSocketContextBridge';

// WebSocketMessageType.MESSAGE is now properly defined in the enum

interface RealWebSocketContextType {
  status: WebSocketStatus;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: any) => boolean;
  addMessageHandler: (handler: (message: WebSocketMessage) => void) => () => void;
  sessionId: string | null;
  setSessionId: (sessionId: string) => void;
  clientId: string;
}

const RealWebSocketContext = createContext<RealWebSocketContextType | null>(null);

export const useRealWebSocket = () => {
  const context = useContext(RealWebSocketContext);
  if (!context) {
    throw new Error('useRealWebSocket must be used within a RealWebSocketProvider');
  }
  return context;
};

interface RealWebSocketProviderProps {
  children: ReactNode;
  sessionId?: string;
}

type MessageHandler = (message: WebSocketMessage) => void;

export const RealWebSocketProvider: FC<RealWebSocketProviderProps> = ({ children, sessionId: initialSessionId }) => {
  // Define constant EVENT_NAMES for Socket.IO events
  const EVENT_NAMES = {
    CONNECTION_STATUS: 'connection_status',
    JOIN_SESSION: 'join_session',
    JOIN_RESPONSE: 'join_response',    // Updated event name
    AUDIO_CHUNK: 'audio_chunk',
    TRANSCRIPTION_UPDATE: 'transcription_update',  // Updated for Deepgram
    SUMMARY_UPDATE: 'summary_update',              // Updated for Gemini
    CHAT_MESSAGE: 'chat_message',                  // Single event for both sending and receiving
    ERROR: 'error',
    MESSAGE: 'message'
  };

  const [status, setStatus] = useState<WebSocketStatus>('connecting');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [isConnectedToSession, setIsConnectedToSession] = useState<boolean>(false);
  const clientId = useRef<string>(uuidv4()).current;
  
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const messageQueueRef = useRef<any[]>([]);
  const messageHandlersRef = useRef<MessageHandler[]>([]);
  
  // Get Socket.IO server URL
  const getSocketIOUrl = useCallback(() => {
    const apiUrl = process.env.REACT_APP_API_URL || '';
    
    if (apiUrl) {
      return apiUrl;
    } else {
      // Default to local server with explicit protocol
      return `http://localhost:8000`; // Force localhost instead of hostname
    }
  }, []);

  // Helper function to notify all message handlers
  const notifyMessageHandlers = useCallback((message: WebSocketMessage) => {
    messageHandlersRef.current.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }, []);

  // Helper function to send a message to the socket
  const sendMessageToSocket = useCallback((socket: Socket, message: any) => {
    // Map WebSocketMessageType to Socket.IO events
    let eventName: string;
    let payload: any;
    
    switch (message.type) {
      case 'connect_session': // Previously WebSocketMessageType.JOIN_SESSION
        // Special case for join session
        return; // This is handled separately
      case 'audio_chunk': // Previously WebSocketMessageType.AUDIO_CHUNK
        eventName = EVENT_NAMES.AUDIO_CHUNK;
        payload = message.data;
        break;
      case 'transcription': // Previously WebSocketMessageType.TRANSCRIPTION
        eventName = EVENT_NAMES.TRANSCRIPTION_UPDATE;
        payload = message.data;
        break;
      default:
        eventName = EVENT_NAMES.MESSAGE;
        payload = message.data;
    }
    
    // Only log non-audio messages to avoid console spam
    if (eventName !== EVENT_NAMES.AUDIO_CHUNK) {
      console.log(`Sending ${eventName} event:`, payload);
    }
    
    socket.emit(eventName, payload);
  }, []);

  // Join a session
  const joinSession = useCallback((newSessionId: string) => {
    setSessionId(newSessionId);
    
    if (socketRef.current && socketRef.current.connected) {
      console.log(`Joining session: ${newSessionId}`);
      
      // Make sure we format the payload exactly as the backend expects it
      const joinData = {
        session_id: newSessionId,
        client_id: clientId
      };
      
      console.log(`Emitting ${EVENT_NAMES.JOIN_SESSION} with data:`, joinData);
      socketRef.current.emit(EVENT_NAMES.JOIN_SESSION, joinData);
      
      // Set up listener for session join confirmation
      socketRef.current.once(EVENT_NAMES.JOIN_RESPONSE, (data) => {
        console.log(`Successfully joined session: ${newSessionId}`, data);
        setIsConnectedToSession(true);
      });
    } else {
      console.log(`Will join session ${newSessionId} once connected`);
    }
  }, [clientId]);

  // Connect to Socket.IO server
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('Socket.IO already connected');
      return;
    }
    
    try {
      const serverUrl = getSocketIOUrl();
      console.log(`Connecting to Socket.IO server at ${serverUrl}`);
      
      // Close existing socket if there is one
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      // Create new Socket.IO connection with improved connection settings
      console.log(`Attempting Socket.IO connection to ${serverUrl} with client ID ${clientId}`);
      
      // Force new connection and use more permissive settings
      const socket = io(serverUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,  // Keep trying forever
        reconnectionDelay: 1000,  // Start with a shorter delay
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5,
        timeout: 20000,  // Longer timeout for slower connections
        autoConnect: true,
        forceNew: true,  // Force a new connection
        transports: ['polling', 'websocket'],  // Try polling first, then websocket
        upgrade: true,  // Allow transport upgrade
        rememberUpgrade: true,
        query: { clientId }
      });
      
      socketRef.current = socket;
      
      // Setup event handlers
      socket.on('connect', () => {
        console.log('Socket.IO connection established');
        setStatus('open');
        reconnectAttemptsRef.current = 0;
        
        // Process any queued messages
        while (messageQueueRef.current.length > 0) {
          const queuedMessage = messageQueueRef.current.shift();
          if (queuedMessage && socket.connected) {
            console.log('Sending queued message:', queuedMessage);
            sendMessageToSocket(socket, queuedMessage);
          }
        }
        
        // Join session if we have one
        if (sessionId) {
          joinSession(sessionId);
        }
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`Socket.IO disconnected: ${reason}`);
        setStatus('closed');
        setIsConnectedToSession(false);
        
        // Handle all disconnect reasons with a reconnection attempt
        console.log(`Disconnected: ${reason}. Attempting manual reconnection...`);
        
        // Clear any existing reconnect timer
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        
        // Schedule a reconnection attempt
        reconnectTimerRef.current = setTimeout(() => {
          console.log('Attempting manual reconnection after disconnect');
          try {
            socket.connect();
          } catch (error) {
            console.error('Error reconnecting:', error);
            // Try a completely new connection
            connect();
          }
        }, 2000);
      });
      
      socket.on('connect_error', (error) => {
        console.error(`Socket.IO connection error: ${error.message}`);
        setStatus('error');
        
        // Log more details about the error
        console.log('Connection error details:', {
          errorMessage: error.message,
          transport: socket.io.engine?.transport?.name,
          url: serverUrl,
          readyState: socket.io.engine?.readyState
        });
        
        // Don't disconnect - let Socket.IO's built-in reconnection handle it
        reconnectAttemptsRef.current += 1;
        
        if (reconnectAttemptsRef.current % 3 === 0) {
          // Every 3 attempts, try recreating the socket entirely
          console.log('Multiple connection errors, recreating socket connection...');
          socket.disconnect();
          
          // Schedule a complete reconnect with exponential backoff
          const backoffDelay = Math.min(
            15000, // Max 15 seconds
            1000 * Math.pow(1.5, reconnectAttemptsRef.current) + Math.random() * 1000
          );
          
          console.log(`Will attempt reconnection in ${backoffDelay}ms`);
          reconnectTimerRef.current = setTimeout(() => {
            console.log('Attempting full socket recreation...');
            connect();
          }, backoffDelay);
        }
      });
      
      // Set up listeners for specific event types
      socket.on(EVENT_NAMES.TRANSCRIPTION_UPDATE, (data) => {
        console.log('Received transcription update:', data);
        const message = { 
          type: 'transcription', // Keep the same type for backward compatibility 
          data: data,
          timestamp: Date.now(),
          sessionId: data.session_id || sessionId
        };
        setLastMessage(message);
        notifyMessageHandlers(message);
      });
      
      socket.on(EVENT_NAMES.ERROR, (data) => {
        console.error('Received error event:', data);
        const message = { 
          type: 'error', 
          data: data,
          timestamp: Date.now()
        };
        setLastMessage(message);
        notifyMessageHandlers(message);
      });
      
      socket.on(EVENT_NAMES.CONNECTION_STATUS, (data) => {
        console.log('Received connection status:', data);
        // Update status based on connection status message
        if (data.status === 'connected') {
          setStatus('open');
        }
      });
      
      // Handle summary events
      socket.on(EVENT_NAMES.SUMMARY_UPDATE, (data) => {
        console.log('Received summary update:', data);
        const message = { 
          type: 'summary', 
          data: data,
          timestamp: Date.now(),
          sessionId: data.session_id || sessionId
        };
        setLastMessage(message);
        notifyMessageHandlers(message);
      });
      
      // Handle chat message events
      socket.on(EVENT_NAMES.CHAT_MESSAGE, (data) => {
        console.log('Received chat message:', data);
        const message = { 
          type: 'chat_message', 
          data: data,
          timestamp: Date.now(),
          sessionId: data.session_id || sessionId
        };
        setLastMessage(message);
        notifyMessageHandlers(message);
      });
      
      // Note: We now use a single chat_message event for both user messages and AI responses
      // The 'from' field in the message indicates whether it's from a user or the assistant
      
      socket.on(EVENT_NAMES.MESSAGE, (data) => {
        console.log('Received generic message:', data);
        const message = { 
          type: 'message', 
          data: data,
          timestamp: Date.now()
        };
        setLastMessage(message);
        notifyMessageHandlers(message);
      });
    } catch (error) {
      console.error('Error creating Socket.IO connection:', error);
      setStatus('error');
    }
  }, [getSocketIOUrl, clientId, sessionId, joinSession, notifyMessageHandlers, sendMessageToSocket]);

  // Connect on component mount
  useEffect(() => {
    connect();
    
    return () => {
      // Disconnect Socket.IO
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      // Clear any timers
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [connect]);

  // Update session when it changes
  useEffect(() => {
    if (sessionId && socketRef.current?.connected) {
      joinSession(sessionId);
    }
  }, [sessionId, joinSession]);

  // Utility function to get a debug-friendly session status string
  const getSessionStatusText = useCallback(() => {
    if (!sessionId) {
      return 'No session selected';
    }

    if (status !== 'open') {
      return `Socket not connected (${status})`;
    }

    if (!isConnectedToSession) {
      return `Not joined to session ${sessionId}`;
    }

    return `Connected to session ${sessionId}`;
  }, [sessionId, status, isConnectedToSession]);
  
  // Send a message through the WebSocket - declared first to avoid circular reference
  const sendMessage = useCallback((message: any): boolean => {
    if (!socketRef.current) {
      console.warn('Cannot send message, socket not initialized');
      messageQueueRef.current.push(message);
      connect(); // Try to connect if socket isn't initialized
      return false;
    }
    
    if (!socketRef.current.connected) {
      console.warn('Cannot send message, socket not connected');
      messageQueueRef.current.push(message);
      return false;
    }
    
    // Handle join session message type specially
    if (message.type === MessageTypes.JOIN_SESSION) {
      if (message.sessionId) {
        joinSession(message.sessionId);
        return true;
      }
      return false;
    }
    
    // Send the message
    try {
      sendMessageToSocket(socketRef.current, message);
      return true;
    } catch (error) {
      console.error(`Error sending message of type ${message.type}:`, error);
      messageQueueRef.current.push(message);
      return false;
    }
  }, [connect, joinSession, sendMessageToSocket]);
  
  // Add a message handler
  const addMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlersRef.current.push(handler);
    
    // Return function to remove this handler
    return () => {
      messageHandlersRef.current = messageHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  return (
    <RealWebSocketContext.Provider
      value={{
        status,
        lastMessage,
        sendMessage,
        addMessageHandler,
        sessionId,
        setSessionId: joinSession,
        clientId
      }}
    >
      {children}
    </RealWebSocketContext.Provider>
  );
};
