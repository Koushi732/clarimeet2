import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import useWebSocket, { WebSocketStatus } from '../hooks/useWebSocket';

// Define message types
export type WebSocketMessageType = 
  'transcription' | 
  'transcription_update' | 
  'summary' | 
  'audio_status' | 
  'session_update' | 
  'connection_status' | 
  'transcription_status' | 
  'chat_request' | 
  'chat_response' | 
  'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
  session_id?: string;
  timestamp?: number;
}

interface WebSocketContextType {
  sendMessage: (message: WebSocketMessage) => boolean;
  lastMessage: WebSocketMessage | null;
  connectionStatus: WebSocketStatus;
  clientId: string;
  addMessageHandler: (type: WebSocketMessageType, handler: (data: any) => void) => () => void;
  reconnect: () => void;
  connectToSession: (sessionId: string) => void;
  disconnectFromSession: () => void;
  isConnectedToSession: boolean;
  currentSessionId: string | null;
  connectionError: string | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode; sessionId?: string }> = ({ children, sessionId }) => {
  // Generate a unique client ID that persists across refreshes
  const [clientId] = useState<string>(() => {
    const storedClientId = localStorage.getItem('clarimeet-client-id');
    if (storedClientId) return storedClientId;
    
    const newClientId = uuidv4();
    localStorage.setItem('clarimeet-client-id', newClientId);
    return newClientId;
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [isConnectedToSession, setIsConnectedToSession] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Use wss:// protocol if on https, otherwise use ws://
  const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const baseWSUrl = `${wsProtocol}localhost:8000`;
  
  // Default connection is to the base session endpoint with client ID
  const [wsUrl, setWsUrl] = useState<string>(`${baseWSUrl}/ws/session/default/connect?client_id=${clientId}`);
  
  console.log('Initial WebSocket URL:', wsUrl);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  // Initialize WebSocket connection
  const {
    status: connectionStatus,
    lastMessage: lastJsonMessage,
    sendMessage: sendJsonMessage,
    addMessageHandler,
    connect
  } = useWebSocket(wsUrl, {
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log(`WebSocket connected to ${wsUrl}`);
      setConnectionError(null);
      
      // Update session connection status based on URL
      if (wsUrl.includes('/transcription/') || wsUrl.includes('/summary/')) {
        setIsConnectedToSession(true);
      } else if (wsUrl.includes('/session/') && currentSessionId && currentSessionId !== 'default') {
        setIsConnectedToSession(true);
      } else {
        setIsConnectedToSession(false);
      }
    },
    onClose: () => {
      console.log('WebSocket disconnected');
      setIsConnectedToSession(false);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      setConnectionError('Failed to connect to server. Please check your connection and try again.');
    }
  });

  // Process incoming messages
  useEffect(() => {
    if (lastJsonMessage) {
      try {
        const message = lastJsonMessage as WebSocketMessage;
        console.log(`Received WebSocket message of type: ${message.type}`);
        setLastMessage(message);
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    }
  }, [lastJsonMessage]);

  // Function to send messages with error handling
  const sendMessage = useCallback((message: WebSocketMessage) => {
    try {
      // Add client ID to outgoing messages if not present
      const enrichedMessage = {
        ...message,
        client_id: clientId,
        timestamp: message.timestamp || Date.now()
      };
      
      // Attempt to send the message
      const success = sendJsonMessage(enrichedMessage);
      
      // If sending failed and we're not connecting, try to reconnect
      if (!success && connectionStatus !== 'connecting') {
        console.warn('Cannot send message, WebSocket is not connected. Attempting to reconnect...');
        connect();
        return false;
      }
      
      return success;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }, [sendJsonMessage, connectionStatus, connect, clientId]);

  // Function to connect to a specific session
  const connectToSession = useCallback((sessionId: string) => {
    if (!sessionId) return;
    
    // Use the correct endpoint from the backend
    const sessionWsUrl = `${baseWSUrl}/ws/session/${sessionId}/connect?client_id=${clientId}`;
    console.log(`Connecting to session: ${sessionId} with URL: ${sessionWsUrl}`);
    
    setCurrentSessionId(sessionId);
    setWsUrl(sessionWsUrl);
  }, [baseWSUrl, clientId]);

  // Function to disconnect from the current session
  const disconnectFromSession = useCallback(() => {
    // Return to default connection
    const defaultWsUrl = `${baseWSUrl}/ws/session/default/connect?client_id=${clientId}`;
    console.log('Disconnecting from session, returning to default connection');
    
    setCurrentSessionId(null);
    setIsConnectedToSession(false);
    setWsUrl(defaultWsUrl);
  }, [baseWSUrl, clientId]);

  // Update WebSocket URL when sessionId prop changes
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      connectToSession(sessionId);
    }
  }, [sessionId, currentSessionId, connectToSession]);

  // Function to manually trigger reconnection
  const reconnect = useCallback(() => {
    console.log('Manual reconnection triggered');
    connect();
    setConnectionError(null);
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ 
      sendMessage, 
      lastMessage, 
      connectionStatus, 
      clientId,
      addMessageHandler,
      reconnect,
      connectToSession,
      disconnectFromSession,
      isConnectedToSession,
      currentSessionId,
      connectionError
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

