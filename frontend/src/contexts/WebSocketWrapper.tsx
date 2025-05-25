import React from 'react';
import { MockWebSocketProvider } from './MockWebSocketContext';

// Always use the mock implementation which doesn't require a backend
// This ensures reliability without network dependencies
interface WebSocketWrapperProps {
  children: React.ReactNode;
  sessionId?: string;
}

// This component always uses the mock implementation for reliability
export const WebSocketWrapper: React.FC<WebSocketWrapperProps> = ({ children, sessionId }) => {
  return (
    <div id="mock-websocket-provider" style={{ display: 'contents' }}>
      <MockWebSocketProvider sessionId={sessionId}>{children}</MockWebSocketProvider>
    </div>
  );
}

export default WebSocketWrapper;
