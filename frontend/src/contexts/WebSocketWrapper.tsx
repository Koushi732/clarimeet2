import React, { useState, useEffect } from 'react';
import { MockWebSocketProvider } from './MockWebSocketContext';
import { RealWebSocketProvider } from './RealWebSocketContext';
import { useSettings } from '../hooks/useSettings';

interface WebSocketWrapperProps {
  children: React.ReactNode;
  sessionId?: string;
}

// This component will use either the real or mock implementation based on settings
export const WebSocketWrapper: React.FC<WebSocketWrapperProps> = ({ children, sessionId }) => {
  const { settings } = useSettings();
  const [useMock, setUseMock] = useState(true);
  const [isBackendAvailable, setIsBackendAvailable] = useState(false);
  
  // Check if backend is available on component mount
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          // Short timeout to avoid blocking UI
          signal: AbortSignal.timeout(2000)
        });
        
        if (response.ok) {
          setIsBackendAvailable(true);
          // Only use real implementation if explicitly enabled in settings
          setUseMock(!settings.enableRealTimeAudio);
        } else {
          setIsBackendAvailable(false);
          setUseMock(true);
        }
      } catch (error) {
        console.warn('Backend not available, using mock WebSocket:', error);
        setIsBackendAvailable(false);
        setUseMock(true);
      }
    };
    
    checkBackendStatus();
  }, [settings.enableRealTimeAudio]);
  
  return useMock ? (
    <div id="mock-websocket-provider" style={{ display: 'contents' }}>
      <MockWebSocketProvider sessionId={sessionId}>{children}</MockWebSocketProvider>
    </div>
  ) : (
    <div id="real-websocket-provider" style={{ display: 'contents' }}>
      <RealWebSocketProvider sessionId={sessionId}>{children}</RealWebSocketProvider>
    </div>
  );
};

export default WebSocketWrapper;
