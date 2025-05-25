import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Define message types
export type WebSocketMessageType = 'transcription' | 'summary' | 'audio_status' | 'session_update' | 'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
}

export type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

interface ElectronWebSocketContextType {
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

const ElectronWebSocketContext = createContext<ElectronWebSocketContextType | undefined>(undefined);

export const useElectronWebSocketContext = () => {
  const context = useContext(ElectronWebSocketContext);
  if (context === undefined) {
    throw new Error('useElectronWebSocketContext must be used within an ElectronWebSocketProvider');
  }
  return context;
};

export const ElectronWebSocketProvider: React.FC<{ children: React.ReactNode; sessionId?: string }> = ({ 
  children, 
  sessionId 
}) => {
  // Generate a unique client ID that persists across refreshes
  const [clientId] = useState<string>(() => {
    const storedClientId = localStorage.getItem('clarimeet-client-id');
    if (storedClientId) return storedClientId;
    
    const newClientId = uuidv4();
    localStorage.setItem('clarimeet-client-id', newClientId);
    return newClientId;
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isConnectedToSession, setIsConnectedToSession] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketStatus>('closed');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  // Message handlers
  const messageHandlers = useRef<Map<WebSocketMessageType, Set<(data: any) => void>>>(new Map());
  const electronHandlerRemoveRef = useRef<(() => void) | null>(null);

  // Connect to Electron's WebSocket-like functionality
  useEffect(() => {
    if (!window.electron) {
      setConnectionError('Electron not available');
      return;
    }
    
    setConnectionStatus('connecting');
    
    // Set up handler for WebSocket messages from Electron
    electronHandlerRemoveRef.current = window.electron.addWebSocketMessageHandler((message: WebSocketMessage) => {
      console.log('[ELECTRON-WS] Received message:', message);
      setLastMessage(message);
      
      // Process message using handlers
      if (message && message.type && messageHandlers.current.has(message.type)) {
        messageHandlers.current.get(message.type)?.forEach(handler => {
          handler(message.data);
        });
      }
    });
    
    // Simulated connection established
    setConnectionStatus('open');
    
    // Update connection status when sessionId changes
    if (sessionId) {
      setCurrentSessionId(sessionId);
      setIsConnectedToSession(true);
    }
    
    return () => {
      if (electronHandlerRemoveRef.current) {
        electronHandlerRemoveRef.current();
      }
    };
  }, []);
  
  // Update session connection when sessionId prop changes
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      connectToSession(sessionId);
    }
  }, [sessionId, currentSessionId]);

  // Function to register message handlers
  const addMessageHandler = useCallback((type: WebSocketMessageType, handler: (data: any) => void) => {
    if (!messageHandlers.current.has(type)) {
      messageHandlers.current.set(type, new Set());
    }
    messageHandlers.current.get(type)?.add(handler);
    
    // Return function to remove the handler
    return () => {
      const handlers = messageHandlers.current.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          messageHandlers.current.delete(type);
        }
      }
    };
  }, []);

  // Function to send messages
  const sendMessage = useCallback((type: WebSocketMessageType, data: any) => {
    if (!window.electron) {
      console.error('[ELECTRON-WS] Electron not available');
      return false;
    }
    
    if (connectionStatus !== 'open') {
      console.warn('[ELECTRON-WS] Cannot send message, connection not open');
      return false;
    }
    
    console.log('[ELECTRON-WS] Sending message:', { type, data });
    window.electron.sendWebSocketMessage(type, data);
    return true;
  }, [connectionStatus]);

  // Function to reconnect
  const reconnect = useCallback(() => {
    console.log('[ELECTRON-WS] Reconnecting...');
    
    // For Electron, we don't need to actually reconnect, just update the status
    setConnectionStatus('open');
    setConnectionError(null);
    
    if (currentSessionId) {
      setIsConnectedToSession(true);
    }
  }, [currentSessionId]);

  // Function to connect to a specific session
  const connectToSession = useCallback((sessionId: string) => {
    if (!sessionId) return;
    
    console.log(`[ELECTRON-WS] Connecting to session: ${sessionId}`);
    setCurrentSessionId(sessionId);
    setIsConnectedToSession(true);
    
    // Notify Electron about the session change
    if (window.electron) {
      window.electron.sendWebSocketMessage('session_connect', { sessionId });
    }
  }, []);

  return (
    <ElectronWebSocketContext.Provider value={{ 
      sendMessage, 
      lastMessage, 
      connectionStatus, 
      clientId,
      addMessageHandler,
      reconnect,
      connectToSession,
      isConnectedToSession,
      currentSessionId,
      connectionError
    }}>
      {children}
    </ElectronWebSocketContext.Provider>
  );
};
