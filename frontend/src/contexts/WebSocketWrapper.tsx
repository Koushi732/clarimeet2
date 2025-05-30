import React, { useState, useEffect } from 'react';
import { MockWebSocketProvider } from './MockWebSocketContext';
import { WebSocketProvider } from './SimpleWebSocketContext';
import { useSettings } from '../hooks/useSettings';

interface WebSocketWrapperProps {
  children: React.ReactNode;
  sessionId?: string;
}

// This component will use either the real or mock implementation based on settings
export const WebSocketWrapper: React.FC<WebSocketWrapperProps> = ({ children, sessionId }) => {
  const { settings } = useSettings();
  // IMPORTANT: Always use real implementation by default, never use mock in development
  const [useMock, setUseMock] = useState(false);
  const [isBackendAvailable, setIsBackendAvailable] = useState(true);
  
  // Check if backend is available on component mount
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        // Use a more reliable health check endpoint
        const backendUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
        console.log(`Checking backend availability at ${backendUrl}/health`);
        
        const response = await fetch(`${backendUrl}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          // Longer timeout for more reliable detection
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          // Only log on state change to reduce console noise
          if (!isBackendAvailable) {
            console.log('Backend health check successful, using real WebSocket implementation');
          }
          setIsBackendAvailable(true);
          
          // FORCE REAL IMPLEMENTATION: never use mock in development
          setUseMock(false);
        } else {
          // Only log on state change to reduce console noise
          if (isBackendAvailable) {
            console.warn(`Backend health check failed with status: ${response.status}`);
            console.warn('Still using real WebSocket implementation despite health check failure');
          }
          setIsBackendAvailable(false);
          // Continue using real implementation even if health check fails
          // This allows the connection to retry if the server comes back online
          setUseMock(false);
        }
      } catch (error) {
        // Only log on state change to reduce console noise
        if (isBackendAvailable) {
          console.warn('Backend not available, but still using real WebSocket for reconnection');
        }
        setIsBackendAvailable(false);
        // Continue using real implementation even if health check fails
        // This allows the connection to retry if the server comes back online
        setUseMock(false);
      }
    };
    
    // Run the check immediately
    checkBackendStatus();
    
    // Set up periodic health checks to detect if backend comes online, but less frequently
    const healthCheckInterval = setInterval(checkBackendStatus, 30000); // Check every 30 seconds to reduce connection churn
    
    return () => {
      clearInterval(healthCheckInterval);
    };
  }, []);
  
  return useMock ? (
    <div id="mock-websocket-provider" style={{ display: 'contents' }}>
      <MockWebSocketProvider sessionId={sessionId}>{children}</MockWebSocketProvider>
    </div>
  ) : (
    <div id="real-websocket-provider" style={{ display: 'contents' }}>
      <WebSocketProvider sessionId={sessionId}>{children}</WebSocketProvider>
    </div>
  );
};

export default WebSocketWrapper;
