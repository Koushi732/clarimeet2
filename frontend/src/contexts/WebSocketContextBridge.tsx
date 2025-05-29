import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import useWebSocket, { WebSocketStatus } from '../hooks/useWebSocket';
import { useSettingsContext } from './SettingsContext';

// Define our types for WebSocket messages
export type WebSocketMessageType = 
  | 'transcription' | 'summary' | 'audio_status' | 'session_update' | 'error' | 'ping' | 'pong' | 'audio_chunk'
  | 'client_connect' | 'connect_session' | 'recording_start' | 'session_connected' | 'session_error'
  | 'transcription_update' | 'summary_update' | 'transcription_status_update' | 'summarization_status_update'
  | 'heartbeat' | 'chat_request' | 'chat_response' | 'message' | 'join_session' | 'register_client';

// Also export a constant object with the same message types for use at runtime
export const MessageTypes = {
  TRANSCRIPTION: 'transcription' as WebSocketMessageType,
  SUMMARY: 'summary' as WebSocketMessageType,
  AUDIO_STATUS: 'audio_status' as WebSocketMessageType,
  SESSION_UPDATE: 'session_update' as WebSocketMessageType,
  ERROR: 'error' as WebSocketMessageType,
  PING: 'ping' as WebSocketMessageType,
  PONG: 'pong' as WebSocketMessageType,
  AUDIO_CHUNK: 'audio_chunk' as WebSocketMessageType,
  CLIENT_CONNECT: 'client_connect' as WebSocketMessageType,
  CONNECT_SESSION: 'connect_session' as WebSocketMessageType,
  RECORDING_START: 'recording_start' as WebSocketMessageType,
  SESSION_CONNECTED: 'session_connected' as WebSocketMessageType,
  SESSION_ERROR: 'session_error' as WebSocketMessageType,
  TRANSCRIPTION_UPDATE: 'transcription_update' as WebSocketMessageType,
  SUMMARY_UPDATE: 'summary_update' as WebSocketMessageType,
  TRANSCRIPTION_STATUS_UPDATE: 'transcription_status_update' as WebSocketMessageType,
  SUMMARIZATION_STATUS_UPDATE: 'summarization_status_update' as WebSocketMessageType,
  HEARTBEAT: 'heartbeat' as WebSocketMessageType,
  CHAT_REQUEST: 'chat_request' as WebSocketMessageType,
  CHAT_RESPONSE: 'chat_response' as WebSocketMessageType,
  MESSAGE: 'message' as WebSocketMessageType,
  JOIN_SESSION: 'join_session' as WebSocketMessageType,
  REGISTER_CLIENT: 'register_client' as WebSocketMessageType
};

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
}

// Define the shape of our context
interface WebSocketContextType {
  sendMessage: (message: any) => boolean;
  lastMessage: WebSocketMessage | null;
  connectionStatus: WebSocketStatus;
  clientId: string;
  addMessageHandler: (type: WebSocketMessageType, handler: (data: any) => void) => () => void;
  reconnect: () => void;
  connectToSession: (sessionId: string) => void;
  isConnectedToSession: boolean;
  currentSessionId: string | null;
  connectionError: string | null;
  connected: boolean;
}

// Create the WebSocket context
const WebSocketContext = createContext<WebSocketContextType | null>(null);

// WebSocket Provider Component
export const WebSocketBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettingsContext();
  // Use a more stable client ID that persists across page refreshes
  const [clientId] = useState<string>(() => {
    // Try to get existing client ID from localStorage
    const existingId = localStorage.getItem('clarimeet_client_id');
    if (existingId) {
      return existingId;
    }
    
    // Create new ID if none exists
    const newId = `client-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('clarimeet_client_id', newId);
    return newId;
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isConnectedToSession, setIsConnectedToSession] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string>(`${settings.apiBaseWebSocketUrl || 'ws://localhost:8000/api'}/ws`);
  
  // Keep track of heartbeat intervals
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Connect to WebSocket
  const {
    status: connectionStatus,
    lastMessage,
    sendMessage: rawSendMessage,
    addMessageHandler,
    connect
  } = useWebSocket(wsUrl, {
    reconnectInterval: 2000, // Faster reconnection attempts
    reconnectAttempts: 15,   // More reconnection attempts
    onOpen: () => {
      console.log('WebSocket connected with client ID:', clientId);
      setConnectionError(null);
      
      // Ensure we register with the server with proper client ID
      // This is critical to avoid the "non-connected client" error
      console.log('Sending client registration with ID:', clientId);
      setTimeout(() => {
        const success = rawSendMessage({
          type: 'client_connect',
          client_id: clientId,
          timestamp: Date.now(),
          app_version: '1.0.0', // Send app version for logging
          reconnect: false // Indicate this is a fresh connection
        });
        
        if (success) {
          console.log('Successfully sent client registration');
        } else {
          console.error('Failed to send client registration');
        }
        
        // If we were previously connected to a session, try to reconnect
        if (currentSessionId) {
          console.log('Attempting to reconnect to session:', currentSessionId);
          connectToSession(currentSessionId);
        }
      }, 500); // Short delay to ensure WebSocket is fully ready
      
      // Set up more frequent heartbeat to maintain connection
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      heartbeatIntervalRef.current = setInterval(() => {
        console.log('Sending heartbeat ping');
        rawSendMessage({
          type: 'ping',
          client_id: clientId,
          timestamp: Date.now()
        });
      }, 15000); // More frequent heartbeat every 15 seconds
    },
    onClose: () => {
      console.log('WebSocket disconnected');
      setIsConnectedToSession(false);
      
      // Clear heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      setConnectionError('Failed to connect to server. Please check your connection.');
      setIsConnectedToSession(false);
    }
  });
  
  // Enhanced sendMessage that handles object serialization and connection status
  const sendMessage = useCallback((message: any): boolean => {
    // Check if WebSocket is connected before sending
    if (connectionStatus !== 'open') {
      console.warn('WebSocket not connected, message will be queued for sending when connection is established');
      
      // Try to reconnect if needed
      if (connectionStatus === 'closed' || connectionStatus === 'closing') {
        console.log('Attempting to reconnect WebSocket...');
        connect();
      }
      
      // Store message in a ref or state for later sending
      const queuedMessage = typeof message === 'string' ? message : {
        ...message,
        client_id: clientId,
        timestamp: Date.now()
      };
      
      // Queue message to be sent after a short delay (wait for connection)
      setTimeout(() => {
        if (connectionStatus === 'open') {
          console.log('Connection established, sending queued message:', 
            typeof queuedMessage === 'string' ? queuedMessage : queuedMessage.type);
          try {
            rawSendMessage(queuedMessage);
          } catch (err) {
            console.error('Error sending queued message:', err);
          }
        } else {
          console.log('WebSocket still not connected, message may be lost');
        }
      }, 2000); // Increased timeout to allow more time for connection
      
      return true; // Indicate message is queued
    }
    
    try {
      console.log(`Sending WebSocket message: ${message.type}`);
      if (typeof message === 'string') {
        return rawSendMessage(message);
      } else {
        return rawSendMessage({
          ...message,
          client_id: clientId,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }, [rawSendMessage, clientId, connectionStatus, connect]);
  
  // Connect to a specific session with improved error handling and reconnection logic
  const connectToSession = useCallback((sessionId: string) => {
    if (!sessionId) {
      console.warn('No session ID provided for WebSocket connection');
      return;
    }
    
    console.log(`Connecting to session: ${sessionId} with client ID: ${clientId}`);
    setCurrentSessionId(sessionId);
    
    // Make sure we're connected to WebSocket first
    if (connectionStatus !== 'open') {
      console.log('WebSocket not connected, attempting to connect first...');
      connect();
      
      // Queue the session connection to happen after WebSocket connects
      setTimeout(() => {
        if (connectionStatus === 'open') {
          console.log(`Retry connecting to session ${sessionId} after WebSocket connection`);
          // Send session connection message
          const success = sendMessage({
            type: 'connect_session',
            session_id: sessionId,
            client_id: clientId,
            timestamp: Date.now()
          });
          
          if (success) {
            console.log(`Successfully sent connection request for session ${sessionId}`);
            setIsConnectedToSession(true);
          } else {
            console.error(`Failed to send connection request for session ${sessionId}`);
            setConnectionError('Failed to connect to session. Please try again.');
          }
        } else {
          console.error('WebSocket still not connected, cannot connect to session');
          setConnectionError('WebSocket connection not available. Please refresh the page.');
        }
      }, 1500);
      return;
    }
    
    // If WebSocket is already connected, send the session connection message directly
    console.log(`Sending direct connection request for session ${sessionId}`);
    const success = sendMessage({
      type: 'connect_session',
      session_id: sessionId,
      client_id: clientId,
      timestamp: Date.now()
    });
    
    if (success) {
      console.log(`Successfully sent connection request for session ${sessionId}`);
      setIsConnectedToSession(true);
    } else {
      console.error(`Failed to send connection request for session ${sessionId}`);
      setConnectionError('Failed to connect to session. Please try again.');
    }
  }, [sendMessage, clientId, connectionStatus, connect]);
  
  // Handle session connection responses
  useEffect(() => {
    if (!lastMessage) return;
    
    if (lastMessage.type === 'session_connected') {
      console.log('Successfully connected to session:', lastMessage.data.session_id);
      setIsConnectedToSession(true);
      setConnectionError(null);
    } else if (lastMessage.type === 'session_error') {
      console.error('Error connecting to session:', lastMessage.data.message);
      setIsConnectedToSession(false);
      setConnectionError(lastMessage.data.message);
    }
  }, [lastMessage]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);
  
  // Update WebSocket URL if API base URL changes
  useEffect(() => {
    const newWsUrl = `${settings.apiBaseWebSocketUrl || 'ws://localhost:8000/api'}/ws`;
    if (newWsUrl !== wsUrl) {
      console.log(`Updating WebSocket URL from ${wsUrl} to ${newWsUrl}`);
      setWsUrl(newWsUrl);
      
      // Force reconnection with new URL
      setTimeout(() => {
        connect();
      }, 500);
    }
  }, [settings.apiBaseWebSocketUrl, wsUrl, connect]);
  
  const contextValue: WebSocketContextType = {
    sendMessage,
    lastMessage,
    connectionStatus,
    clientId,
    addMessageHandler,
    reconnect: connect,
    connectToSession,
    isConnectedToSession,
    currentSessionId,
    connectionError,
    connected: connectionStatus === 'open'
  };
  
  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Custom hook for using the WebSocket context
export const useWebSocketBridge = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    // Fallback values if context is not available
    return {
      sendMessage: () => {
        console.warn('WebSocket not available');
        return false;
      },
      lastMessage: null,
      connectionStatus: 'closed',
      clientId: 'fallback-client',
      addMessageHandler: () => () => {},
      reconnect: () => {},
      connectToSession: () => {},
      isConnectedToSession: false,
      currentSessionId: null,
      connectionError: 'WebSocket context not available',
      connected: false
    };
  }
  
  return context;
};
