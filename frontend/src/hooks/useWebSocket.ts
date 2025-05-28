import { useState, useEffect, useCallback, useRef } from 'react';

export type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';
export type MessageHandler = (data: any) => void;

interface UseWebSocketOptions {
  reconnectInterval?: number;
  reconnectAttempts?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export const useWebSocket = (
  url: string,
  options: UseWebSocketOptions = {}
) => {
  const {
    reconnectInterval = 3000,
    reconnectAttempts = 5,
    onOpen,
    onClose,
    onError,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const reconnectCount = useRef(0);
  const ws = useRef<WebSocket | null>(null);
  const messageHandlers = useRef<Map<string, Set<MessageHandler>>>(new Map());

  // Connect to WebSocket with improved reliability
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    // Close existing connection if any
    if (ws.current) {
      console.log('Closing existing WebSocket connection');
      try {
        ws.current.close();
      } catch (err) {
        console.warn('Error closing existing WebSocket:', err);
      }
    }

    console.log(`Connecting to WebSocket: ${url}`);
    setStatus('connecting');
    
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connection established successfully');
      setStatus('open');
      reconnectCount.current = 0;
      if (onOpen) onOpen();
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Log the message type but not the full data (could be large)
        console.log(`Received WebSocket message: ${data.type || 'unknown type'}`);
        setLastMessage(data);
        
        // Handle message based on type
        if (data.type && messageHandlers.current.has(data.type)) {
          const handlers = messageHandlers.current.get(data.type);
          if (handlers && handlers.size > 0) {
            console.log(`Invoking ${handlers.size} handlers for message type: ${data.type}`);
            handlers.forEach((handler) => {
              try {
                handler(data);
              } catch (handlerError) {
                console.error(`Error in message handler for ${data.type}:`, handlerError);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        console.log('Raw message data:', event.data.substring(0, 100) + '...');
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket connection error:', error);
      setStatus('error');
      if (onError) onError(error);
    };
    
    socket.onclose = (event) => {
      console.log(`WebSocket connection closed with code: ${event.code}, reason: ${event.reason || 'No reason provided'}`);
      setStatus('closed');
      
      // Attempt to reconnect with exponential backoff
      if (reconnectCount.current < reconnectAttempts) {
        const delay = reconnectInterval * Math.pow(1.5, reconnectCount.current);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectCount.current + 1}/${reconnectAttempts})`);
        reconnectCount.current += 1;
        setTimeout(() => connect(), delay);
      } else {
        console.warn(`Maximum reconnection attempts (${reconnectAttempts}) reached. Giving up.`);
      }
      
      if (onClose) onClose();
    };
  }, [url, reconnectInterval, reconnectAttempts, onOpen, onClose, onError]);

  // Send message with better error handling and reconnection
  const sendMessage = useCallback((data: any) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not open, attempting reconnection before sending message');
      // Try to reconnect if needed
      if (status !== 'connecting') {
        connect();
      }
      
      // Queue the message to be sent after a short delay (after connection is established)
      setTimeout(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          try {
            const message = typeof data === 'string' ? data : JSON.stringify(data);
            ws.current.send(message);
            console.log('Message sent after reconnection:', data.type || 'unknown');
            return true;
          } catch (err) {
            console.error('Error sending delayed message:', err);
            return false;
          }
        } else {
          console.error('WebSocket still not open after reconnection attempt');
          return false;
        }
      }, 500);
      
      // Indicate that the message will be sent asynchronously
      return true;
    }
    
    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      ws.current.send(message);
      console.log('Message sent successfully:', data.type || 'unknown');
      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      return false;
    }
  }, [status, connect]);

  // Register message handler
  const addMessageHandler = useCallback((type: string, handler: MessageHandler) => {
    if (!messageHandlers.current.has(type)) {
      messageHandlers.current.set(type, new Set());
    }
    messageHandlers.current.get(type)?.add(handler);
    
    // Return cleanup function
    return () => {
      messageHandlers.current.get(type)?.delete(handler);
      if (messageHandlers.current.get(type)?.size === 0) {
        messageHandlers.current.delete(type);
      }
    };
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    
    // Cleanup on unmount
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  // Reconnect when URL changes
  useEffect(() => {
    if (ws.current) {
      connect();
    }
  }, [url, connect]);

  return {
    status,
    lastMessage,
    sendMessage,
    addMessageHandler,
    connect,
  };
};

export default useWebSocket;
