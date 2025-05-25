import React from 'react';
import ElectronMiniTab from '../components/floating/ElectronMiniTab';
import { SessionProvider } from '../contexts/SessionContext';
import { AudioProvider } from '../contexts/AudioContext';
import WebSocketWrapper from '../contexts/WebSocketWrapper';

const MiniTabPage: React.FC = () => {
  // Apply transparent styling to the body for this page
  React.useEffect(() => {
    document.body.classList.add('transparent-window');
    
    return () => {
      document.body.classList.remove('transparent-window');
    };
  }, []);

  return (
    <WebSocketWrapper>
      <AudioProvider>
        <SessionProvider>
          <ElectronMiniTab />
        </SessionProvider>
      </AudioProvider>
    </WebSocketWrapper>
  );
};

export default MiniTabPage;
