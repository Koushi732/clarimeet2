import React from 'react';
import { WebSocketProvider } from './WebSocketContext';
import { MockWebSocketProvider } from './MockWebSocketContext';

// Set this to false to use the real WebSocket connection
// Set to true to use the mock implementation that doesn't require a backend
const USE_MOCK_WEBSOCKET = true;

interface WebSocketWrapperProps {
  children: React.ReactNode;
  sessionId?: string;
}

// This component acts as a switch between the real and mock implementations
export const WebSocketWrapper: React.FC<WebSocketWrapperProps> = ({ children, sessionId }) => {
  if (USE_MOCK_WEBSOCKET) {
    return (
      <div id="mock-websocket-provider" style={{ display: 'contents' }}>
        <MockWebSocketProvider sessionId={sessionId}>{children}</MockWebSocketProvider>
      </div>
    );
  } else {
    return (
      <div id="real-websocket-provider" style={{ display: 'contents' }}>
        <WebSocketProvider sessionId={sessionId}>{children}</WebSocketProvider>
      </div>
    );
  }
};

export default WebSocketWrapper;
