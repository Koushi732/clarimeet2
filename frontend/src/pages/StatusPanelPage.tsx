import React from 'react';
import ElectronStatusPanel from '../components/floating/ElectronStatusPanel';
import { SessionProvider } from '../contexts/SessionContext';
import WebSocketWrapper from '../contexts/WebSocketWrapper';

const StatusPanelPage: React.FC = () => {
  // Apply transparent styling to the body for this page
  React.useEffect(() => {
    document.body.classList.add('transparent-window');
    
    return () => {
      document.body.classList.remove('transparent-window');
    };
  }, []);

  return (
    <WebSocketWrapper>
      <SessionProvider>
        <ElectronStatusPanel />
      </SessionProvider>
    </WebSocketWrapper>
  );
};

export default StatusPanelPage;
