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

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    // Close existing connection if any
    if (ws.current) {
      ws.current.close();
    }

    setStatus('connecting');
    
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      setStatus('open');
      reconnectCount.current = 0;
      if (onOpen) onOpen();
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        
        // Handle message based on type
        if (data.type && messageHandlers.current.has(data.type)) {
          messageHandlers.current.get(data.type)?.forEach((handler) => {
            handler(data);
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.onclose = () => {
      setStatus('closed');
      
      // Attempt to reconnect
      if (reconnectCount.current < reconnectAttempts) {
        reconnectCount.current += 1;
        setTimeout(() => connect(), reconnectInterval);
      }
      
      if (onClose) onClose();
    };

    socket.onerror = (error) => {
      setStatus('error');
      if (onError) onError(error);
    };
  }, [url, reconnectInterval, reconnectAttempts, onOpen, onClose, onError]);

  // Send message
  const sendMessage = useCallback((data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

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
