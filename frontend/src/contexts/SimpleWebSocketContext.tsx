import React, { createContext, useContext, useEffect, useState, useRef, useCallback, FC, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketHelper } from './WebSocketHelper';

// Define the WebSocket context type
interface WebSocketContextType {
  status: 'connecting' | 'open' | 'closed' | 'error';
  isConnected: boolean;
  sendMessage: (event: string, data: any) => boolean;
  addMessageHandler: (handler: (event: string, data: any) => void) => () => void;
  sessionId: string | null;
  setSessionId: (sessionId: string) => void;
  clientId: string;
  lastMessage: { event: string, data: any } | null;
}

// Create the context
const WebSocketContext = createContext<WebSocketContextType | null>(null);

// Hook to use the WebSocket context
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

// Props for the WebSocket provider
interface WebSocketProviderProps {
  children: ReactNode;
  sessionId?: string;
}

// WebSocket provider component
export const WebSocketProvider: FC<WebSocketProviderProps> = ({ children, sessionId: initialSessionId }) => {
  // State variables
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [lastMessage, setLastMessage] = useState<{ event: string, data: any } | null>(null);
  
  // Generate a unique client ID
  const clientId = useRef<string>(uuidv4()).current;
  
  // Create the WebSocket helper
  const wsHelperRef = useRef<WebSocketHelper | null>(null);

  // Get the Socket.IO server URL
  const getSocketUrl = useCallback(() => {
    const apiUrl = process.env.REACT_APP_API_URL || '';
    if (apiUrl) {
      return apiUrl;
    } else {
      return 'http://localhost:8000';
    }
  }, []);

  // Initialize the WebSocket helper
  const initWebSocketHelper = useCallback(() => {
    if (wsHelperRef.current) {
      wsHelperRef.current.disconnect();
    }

    const wsHelper = new WebSocketHelper(getSocketUrl(), clientId);
    
    // Set up connection status handler
    wsHelper.addConnectionHandler((status) => {
      console.log(`WebSocket connection status changed to: ${status}`);
      if (status === 'connected') {
        setStatus('open');
        setIsConnected(true);
        
        // Join session if we have one
        if (sessionId) {
          wsHelper.joinSession(sessionId);
        }
      } else if (status === 'disconnected') {
        setStatus('closed');
        setIsConnected(false);
      } else if (status === 'error') {
        setStatus('error');
        setIsConnected(false);
      }
    });
    
    // Set up message handler
    wsHelper.addMessageHandler((event, data) => {
      setLastMessage({ event, data });
    });
    
    wsHelperRef.current = wsHelper;
    
    // Connect to the WebSocket server
    wsHelper.connect();
    
    return wsHelper;
  }, [getSocketUrl, clientId, sessionId]);

  // Initialize the WebSocket helper on component mount
  useEffect(() => {
    const wsHelper = initWebSocketHelper();
    
    return () => {
      wsHelper.disconnect();
    };
  }, [initWebSocketHelper]);

  // Join session when it changes
  useEffect(() => {
    if (sessionId && wsHelperRef.current && wsHelperRef.current.isConnected()) {
      wsHelperRef.current.joinSession(sessionId);
    }
  }, [sessionId]);

  // Send a message
  const sendMessage = useCallback((event: string, data: any): boolean => {
    if (!wsHelperRef.current) {
      console.warn('Cannot send message, WebSocket helper not initialized');
      return false;
    }
    
    return wsHelperRef.current.send(event, data);
  }, []);

  // Add a message handler
  const addMessageHandler = useCallback((handler: (event: string, data: any) => void) => {
    if (!wsHelperRef.current) {
      console.warn('Cannot add message handler, WebSocket helper not initialized');
      return () => {};
    }
    
    return wsHelperRef.current.addMessageHandler(handler);
  }, []);

  // Set session ID
  const handleSetSessionId = useCallback((newSessionId: string) => {
    setSessionId(newSessionId);
    
    if (wsHelperRef.current && wsHelperRef.current.isConnected()) {
      wsHelperRef.current.joinSession(newSessionId);
    }
  }, []);

  // Create the context value
  const contextValue: WebSocketContextType = {
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
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};
