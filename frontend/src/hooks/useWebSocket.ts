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

  // Connect to WebSocket with improved reliability and backoff strategy
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    // Prevent rapid reconnection attempts
    const minReconnectDelay = 1000; // ms
    const lastConnectAttempt = ws.current?.lastConnectAttempt || 0;
    const now = Date.now();
    if (now - lastConnectAttempt < minReconnectDelay) {
      console.log(`Throttling reconnection attempt, last attempt was ${now - lastConnectAttempt}ms ago`);
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
    
    // Try to create a WebSocket, handling potential constructor errors
    let socket;
    try {
      socket = new WebSocket(url);
      // Store connection timestamp for throttling
      socket.lastConnectAttempt = Date.now();
      ws.current = socket;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setStatus('error');
      if (onError) onError(new Event('error'));
      return;
    }

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
      
      // Don't attempt to reconnect on normal closure (1000) or if component is unmounting
      const isNormalClosure = event.code === 1000;
      const isUnmounting = ws.current === null;
      
      if (!isNormalClosure && !isUnmounting && reconnectCount.current < reconnectAttempts) {
        // Use exponential backoff with jitter for more reliable reconnection
        const baseDelay = reconnectInterval * Math.pow(1.5, reconnectCount.current);
        const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% random jitter
        const delay = baseDelay + jitter;
        
        console.log(`Attempting to reconnect in ${Math.round(delay)}ms (attempt ${reconnectCount.current + 1}/${reconnectAttempts})`);
        reconnectCount.current += 1;
        
        // Schedule reconnection
        setTimeout(() => {
          if (ws.current !== null) { // Only reconnect if not unmounted
            connect();
          }
        }, delay);
      } else if (reconnectCount.current >= reconnectAttempts) {
        console.warn(`Maximum reconnection attempts (${reconnectAttempts}) reached. Giving up.`);
      }
      
      if (onClose) onClose();
    };
  }, [url, reconnectInterval, reconnectAttempts, onOpen, onClose, onError]);

  // Message queue for messages that couldn't be sent immediately
  const pendingMessages = useRef<any[]>([]);
  
  // Process pending messages when connection is established
  const processPendingMessages = useCallback(() => {
    if (status !== 'open' || !ws.current || pendingMessages.current.length === 0) {
      return;
    }
    
    console.log(`Processing ${pendingMessages.current.length} pending messages`);
    
    // Take a copy of the queue and clear it
    const messages = [...pendingMessages.current];
    pendingMessages.current = [];
    
    // Send all pending messages
    messages.forEach(data => {
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        ws.current!.send(message);
        console.log('Sent queued message:', data.type || 'unknown');
      } catch (err) {
        console.error('Error sending queued message:', err);
        // Re-queue messages that failed to send
        pendingMessages.current.push(data);
      }
    });
  }, [status]);
  
  // Process pending messages when connection status changes to open
  useEffect(() => {
    if (status === 'open') {
      processPendingMessages();
    }
  }, [status, processPendingMessages]);

  // Send message with better error handling and reconnection
  const sendMessage = useCallback((data: any) => {
    // If WebSocket is not connected, queue the message and try to reconnect
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not open, queueing message and attempting reconnection');
      pendingMessages.current.push(data);
      
      // Try to reconnect if needed
      if (status !== 'connecting') {
        connect();
      }
      
      // Return false to indicate message wasn't sent immediately
      // but it's been queued for later delivery
      return false;
    }
    
    // If connected, send the message right away
    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      ws.current.send(message);
      console.log('Message sent successfully:', data.type || 'unknown');
      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      // Queue message for later retry
      pendingMessages.current.push(data);
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
