import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

export type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';
export type MessageHandler = (data: any) => void;

interface UseMockWebSocketOptions {
  reconnectInterval?: number;
  reconnectAttempts?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

// This is now an enhanced mock WebSocket that integrates with Electron
export const useMockWebSocket = (
  url: string,
  options: UseMockWebSocketOptions = {}
) => {
  const {
    onOpen,
    onClose,
    onError,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const messageHandlers = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const mockSessionId = useRef<string>(url.split('/').pop() || '');
  const mockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const electronHandlerRemoveRef = useRef<(() => void) | null>(null);

  // Connect using Electron when available
  const connect = useCallback(() => {
    console.log('[MOCK] Connecting to:', url);
    setStatus('connecting');
    
    // Set up with real connection if Electron is available
    if (window.electron) {
      // Set up handler for WebSocket-like messages from Electron
      if (electronHandlerRemoveRef.current) {
        electronHandlerRemoveRef.current();
      }
      
      electronHandlerRemoveRef.current = window.electron.addWebSocketMessageHandler((message: any) => {
        setLastMessage(message);
        
        // Process message using handlers
        if (message && message.type && messageHandlers.current.has(message.type)) {
          messageHandlers.current.get(message.type)?.forEach(handler => {
            handler(message.data);
          });
        }
      });
      
      setStatus('open');
      if (onOpen) onOpen();
      console.log('[ELECTRON-WS] WebSocket connected');
    } else {
      // Fallback to simulated connection
      setTimeout(() => {
        setStatus('open');
        if (onOpen) onOpen();
        console.log('[MOCK] WebSocket connected');
        
        // Start sending mock messages if it's a session WebSocket
        if (url.includes('/api/transcribe/') || url.includes('/api/summarize/')) {
          startMockMessages();
        }
      }, 500);
    }
  }, [url, onOpen]);

  // Send simulated messages periodically when not using Electron
  const startMockMessages = useCallback(() => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
    }
    
    // Determine what type of updates to send based on the URL
    const isTranscription = url.includes('/api/transcribe/');
    const isSummarization = url.includes('/api/summarize/');
    
    mockIntervalRef.current = setInterval(() => {
      if (isTranscription) {
        const mockTranscriptionUpdate = {
          type: 'transcription',
          data: {
            id: uuidv4(),
            sessionId: mockSessionId.current,
            text: getRandomTranscriptionText(),
            timestamp: Date.now() / 1000,
            speaker: `Speaker ${Math.floor(Math.random() * 3) + 1}`,
            confidence: 0.85 + (Math.random() * 0.15)
          }
        };
        
        setLastMessage(mockTranscriptionUpdate);
        messageHandlers.current.get('transcription')?.forEach(handler => {
          handler(mockTranscriptionUpdate);
        });
      }
      
      if (isSummarization && Math.random() > 0.7) {  // Less frequent summary updates
        const mockSummaryUpdate = {
          type: 'summary',
          data: {
            sessionId: mockSessionId.current,
            summaryType: 'incremental',
            text: getRandomSummaryText(),
            timestamp: Date.now() / 1000,
            segmentStart: Math.floor(Math.random() * 300),
            segmentEnd: Math.floor(Math.random() * 300) + 300
          }
        };
        
        setLastMessage(mockSummaryUpdate);
        messageHandlers.current.get('summary')?.forEach(handler => {
          handler(mockSummaryUpdate);
        });
      }
      
      // Occasionally send audio status updates
      if (Math.random() > 0.8) {
        const mockAudioStatus = {
          type: 'audio_status',
          data: {
            sessionId: mockSessionId.current,
            isRecording: true,
            audioLevel: Math.random() * 100,
            duration: Math.floor(Date.now() / 1000) % 3600, // Simulate elapsed time
            timestamp: Date.now() / 1000
          }
        };
        
        setLastMessage(mockAudioStatus);
        messageHandlers.current.get('audio_status')?.forEach(handler => {
          handler(mockAudioStatus);
        });
      }
    }, 2000 + Math.random() * 1000);  // Random interval between 2-3 seconds
    
    return () => {
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current);
      }
    };
  }, [url]);

  // Simulate sending a message
  const sendMessage = useCallback((data: any) => {
    console.log('[MOCK] Sending message:', data);
    
    // Simulate successful send
    if (status === 'open') {
      // For certain message types, we can simulate a response
      if (data.type === 'start_recording') {
        setTimeout(() => {
          const response = {
            type: 'session_update',
            data: {
              sessionId: data.data.sessionId || uuidv4(),
              status: 'recording',
              message: 'Recording started successfully'
            }
          };
          setLastMessage(response);
          messageHandlers.current.get('session_update')?.forEach(handler => {
            handler(response);
          });
        }, 500);
      }
      
      if (data.type === 'stop_recording') {
        setTimeout(() => {
          const response = {
            type: 'session_update',
            data: {
              sessionId: data.data.sessionId,
              status: 'completed',
              message: 'Recording stopped successfully'
            }
          };
          setLastMessage(response);
          messageHandlers.current.get('session_update')?.forEach(handler => {
            handler(response);
          });
        }, 500);
      }
      
      return true;
    }
    return false;
  }, [status]);

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

  // Helper functions to generate random mock content
  function getRandomTranscriptionText() {
    const phrases = [
      "I think we should focus on improving the user experience first.",
      "The latest metrics show a significant increase in user engagement.",
      "We need to address the performance issues before the next release.",
      "Let's schedule a follow-up meeting to discuss this further.",
      "The new feature has been well-received by our beta testers.",
      "We should prioritize fixing the critical bugs reported last week.",
      "The design team has finished the mockups for the new dashboard.",
      "Our competitors just launched a similar feature, we need to differentiate.",
      "The API documentation needs to be updated with the recent changes.",
      "We're on track to meet the quarterly goals according to the latest report."
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }
  
  function getRandomSummaryText() {
    const summaries = [
      "The team discussed project timeline and agreed to prioritize UX improvements before adding new features.",
      "Key decisions: (1) Fix critical bugs by Friday, (2) Schedule user testing next week, (3) Postpone the marketing campaign.",
      "The meeting focused on performance issues. Action items: optimize database queries, implement caching, and review third-party dependencies.",
      "Team reviewed Q2 metrics showing 15% growth in user engagement. Next steps include expanding the analytics dashboard and setting Q3 targets.",
      "Discussion about the new competitor product. Team agreed to accelerate development of unique features while monitoring market response."
    ];
    return summaries[Math.floor(Math.random() * summaries.length)];
  }

  // Connect on mount
  useEffect(() => {
    connect();
    
    // Cleanup on unmount
    return () => {
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current);
      }
      setStatus('closed');
      if (onClose) onClose();
    };
  }, [connect, onClose]);

  // Reconnect when URL changes
  useEffect(() => {
    connect();
    mockSessionId.current = url.split('/').pop() || '';
  }, [url, connect]);

  return {
    status,
    lastMessage,
    sendMessage,
    addMessageHandler,
    connect,
  };
};

export default useMockWebSocket;
