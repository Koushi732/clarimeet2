import React, { createContext, useContext, useEffect, useState, useRef, useCallback, FC, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DirectWebSocketClient } from './DirectWebSocketClient';

// Define the WebSocket context type
interface DirectWebSocketContextType {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  isConnected: boolean;
  sendMessage: (event: string, data: any) => boolean;
  addMessageHandler: (handler: (event: string, data: any) => void) => () => void;
  sessionId: string | null;
  setSessionId: (sessionId: string) => void;
  clientId: string;
  lastMessage: { event: string, data: any } | null;
}

// Create the context
const DirectWebSocketContext = createContext<DirectWebSocketContextType | null>(null);

// Hook to use the WebSocket context
export const useDirectWebSocket = () => {
  const context = useContext(DirectWebSocketContext);
  if (!context) {
    throw new Error('useDirectWebSocket must be used within a DirectWebSocketProvider');
  }
  return context;
};

// Props for the WebSocket provider
interface DirectWebSocketProviderProps {
  children: ReactNode;
  sessionId?: string;
}

// WebSocket provider component
export const DirectWebSocketProvider: FC<DirectWebSocketProviderProps> = ({ children, sessionId: initialSessionId }) => {
  // State variables
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [lastMessage, setLastMessage] = useState<{ event: string, data: any } | null>(null);
  
  // Generate a unique client ID
  const clientId = useRef<string>(uuidv4()).current;
  
  // Create the WebSocket client
  const wsClientRef = useRef<DirectWebSocketClient | null>(null);

  // Initialize the WebSocket client
  const initWebSocketClient = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
    }

    const host = 'localhost';
    const port = 8000;
    const wsClient = new DirectWebSocketClient(host, port, clientId);
    
    // Set up status handler
    wsClient.addStatusHandler((status) => {
      console.log(`WebSocket connection status changed to: ${status}`);
      if (status === 'connected') {
        setStatus('connected');
        setIsConnected(true);
        
        // Join session if we have one
        if (sessionId) {
          wsClient.joinSession(sessionId);
        }
      } else if (status === 'disconnected') {
        setStatus('disconnected');
        setIsConnected(false);
      } else if (status === 'error') {
        setStatus('error');
        setIsConnected(false);
      }
    });
    
    // Set up message handler
    wsClient.addMessageHandler((event, data) => {
      setLastMessage({ event, data });
    });
    
    wsClientRef.current = wsClient;
    
    return wsClient;
  }, [clientId, sessionId]);

  // Initialize the WebSocket client on component mount
  useEffect(() => {
    const wsClient = initWebSocketClient();
    
    return () => {
      wsClient.disconnect();
    };
  }, [initWebSocketClient]);

  // Join session when it changes
  useEffect(() => {
    if (sessionId && wsClientRef.current && wsClientRef.current.isConnected()) {
      wsClientRef.current.joinSession(sessionId);
    }
  }, [sessionId]);

  // Send a message
  const sendMessage = useCallback((event: string, data: any): boolean => {
    if (!wsClientRef.current) {
      console.warn('Cannot send message, WebSocket client not initialized');
      return false;
    }
    
    return wsClientRef.current.send(event, data);
  }, []);

  // Add a message handler
  const addMessageHandler = useCallback((handler: (event: string, data: any) => void) => {
    if (!wsClientRef.current) {
      console.warn('Cannot add message handler, WebSocket client not initialized');
      return () => {};
    }
    
    return wsClientRef.current.addMessageHandler(handler);
  }, []);

  // Set session ID
  const handleSetSessionId = useCallback((newSessionId: string) => {
    setSessionId(newSessionId);
    
    if (wsClientRef.current && wsClientRef.current.isConnected()) {
      wsClientRef.current.joinSession(newSessionId);
    }
  }, []);

  // Create the context value
  const contextValue: DirectWebSocketContextType = {
    status,
    isConnected,
    sendMessage,
    addMessageHandler,
    sessionId,
    setSessionId: handleSetSessionId,
    clientId,
    lastMessage
  };

  return (
    <DirectWebSocketContext.Provider value={contextValue}>
      {children}
    </DirectWebSocketContext.Provider>
  );
};
