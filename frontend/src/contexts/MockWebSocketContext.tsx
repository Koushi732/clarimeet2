import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import useMockWebSocket, { WebSocketStatus } from '../hooks/useMockWebSocket';

// Define message types - same as WebSocketContext
export type WebSocketMessageType = 'transcription' | 'summary' | 'audio_status' | 'session_update' | 'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
}

interface WebSocketContextType {
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

const MockWebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useMockWebSocketContext = () => {
  const context = useContext(MockWebSocketContext);
  if (context === undefined) {
    throw new Error('useMockWebSocketContext must be used within a MockWebSocketProvider');
  }
  return context;
};

export const MockWebSocketProvider: React.FC<{ children: React.ReactNode; sessionId?: string }> = ({ children, sessionId }) => {
  // Generate a unique client ID that persists across refreshes
  const [clientId] = useState<string>(() => {
    const storedClientId = localStorage.getItem('clariimeet-client-id');
    if (storedClientId) return storedClientId;
    
    const newClientId = uuidv4();
    localStorage.setItem('clariimeet-client-id', newClientId);
    return newClientId;
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isConnectedToSession, setIsConnectedToSession] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const [wsUrl, setWsUrl] = useState<string>(`${wsProtocol}localhost:8000/ws/${clientId}`);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  // Initialize WebSocket connection using our mock hook
  const {
    status: connectionStatus,
    lastMessage: lastJsonMessage,
    sendMessage: sendJsonMessage,
    addMessageHandler,
    connect
  } = useMockWebSocket(wsUrl, {
    onOpen: () => {
      console.log(`[MOCK] WebSocket connected to ${wsUrl}`);
      setConnectionError(null);
      
      // Update session connection status
      if (wsUrl.includes('/api/transcribe/') || wsUrl.includes('/api/summarize/')) {
        setIsConnectedToSession(true);
      } else {
        setIsConnectedToSession(false);
      }
    },
    onClose: () => {
      console.log('[MOCK] WebSocket disconnected');
      setIsConnectedToSession(false);
    },
    onError: (error) => {
      console.error('[MOCK] WebSocket error:', error);
      setConnectionError('Failed to connect to server. Please check your connection and try again.');
    }
  });

  // Process incoming messages
  useEffect(() => {
    if (lastJsonMessage) {
      try {
        setLastMessage(lastJsonMessage as WebSocketMessage);
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    }
  }, [lastJsonMessage]);

  // Function to send typed messages with error handling
  const sendMessage = useCallback((type: WebSocketMessageType, data: any) => {
    try {
      const success = sendJsonMessage({ type, data });
      if (!success && connectionStatus !== 'open') {
        console.warn('[MOCK] Cannot send message, WebSocket is not connected. Attempting to reconnect...');
        connect();
      }
      return success;
    } catch (error) {
      console.error('[MOCK] Error sending WebSocket message:', error);
      return false;
    }
  }, [sendJsonMessage, connectionStatus, connect]);

  // Function to connect to a specific session
  const connectToSession = useCallback((sessionId: string) => {
    if (!sessionId) return;
    
    const transcribeWsUrl = `${wsProtocol}localhost:8000/api/transcribe/${sessionId}`;
    console.log(`[MOCK] Connecting to session: ${sessionId} with URL: ${transcribeWsUrl}`);
    
    setCurrentSessionId(sessionId);
    setWsUrl(transcribeWsUrl);
  }, [wsProtocol]);

  // Update WebSocket URL when sessionId prop changes
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      connectToSession(sessionId);
    }
  }, [sessionId, currentSessionId, connectToSession]);

  // Function to manually trigger reconnection
  const reconnect = useCallback(() => {
    connect();
    setConnectionError(null);
  }, [connect]);

  return (
    <MockWebSocketContext.Provider value={{ 
      sendMessage, 
      lastMessage, 
      connectionStatus, 
      clientId,
      addMessageHandler: addMessageHandler as (type: WebSocketMessageType, handler: (data: any) => void) => () => void,
      reconnect,
      connectToSession,
      isConnectedToSession,
      currentSessionId,
      connectionError
    }}>
      {children}
    </MockWebSocketContext.Provider>
  );
};
