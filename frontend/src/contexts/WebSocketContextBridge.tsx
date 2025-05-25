import * as React from 'react';
import { createContext, useContext } from 'react';
import { WebSocketStatus } from '../hooks/useWebSocket';

// Define our types from scratch to avoid dependency issues
export type WebSocketMessageType = 'transcription' | 'summary' | 'audio_status' | 'session_update' | 'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
}

// Define the shape of our context
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

// Create a fallback context that can be used if neither provider is available
const FallbackContext = createContext<WebSocketContextType>({
  sendMessage: () => console.warn('WebSocket not available'),
  lastMessage: null,
  connectionStatus: 'closed',
  clientId: 'fallback-client',
  addMessageHandler: () => () => {},
  reconnect: () => {},
  connectToSession: () => {},
  isConnectedToSession: false,
  currentSessionId: null,
  connectionError: 'WebSocket context not available'
});

// Create a bridge context
export const useWebSocketBridge = () => {
  // Check if we're using mock mode
  const useMockMode = true; // This should match the setting in WebSocketWrapper.tsx
  
  // Create refs to track if each context is available
  const [isMockAvailable, setIsMockAvailable] = React.useState(false);
  const [isRealAvailable, setIsRealAvailable] = React.useState(false);
  
  // Attempt to use the mock context first
  React.useEffect(() => {
    try {
      const mockCtx = document.getElementById('mock-websocket-provider');
      setIsMockAvailable(!!mockCtx);
    } catch (error) {
      setIsMockAvailable(false);
    }
    
    try {
      const realCtx = document.getElementById('real-websocket-provider');
      setIsRealAvailable(!!realCtx);
    } catch (error) {
      setIsRealAvailable(false);
    }
  }, []);
  
  // Use the context directly
  const context = React.useContext(FallbackContext);
  
  // Use the context determined by the mode
  if (useMockMode && isMockAvailable) {
    // Use the mock context
    // The context will be provided by WebSocketWrapper
    return context;
  } else if (!useMockMode && isRealAvailable) {
    // Use the real context
    // The context will be provided by WebSocketWrapper
    return context;
  }
  
  // Return the fallback context if neither is available
  return context;
};

// Export a dummy provider for testing
export const WebSocketBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};
