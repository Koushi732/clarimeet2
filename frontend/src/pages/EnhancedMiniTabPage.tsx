import React from 'react';
import EnhancedMiniTab from '../components/floating/EnhancedMiniTab';
import { SessionProvider } from '../contexts/SessionContext';
import { AudioProvider } from '../contexts/SimpleAudioContext';
import WebSocketWrapper from '../contexts/WebSocketWrapper';

const EnhancedMiniTabPage: React.FC = () => {
  // Apply transparent styling to the body for this page
  React.useEffect(() => {
    document.body.classList.add('transparent-window');
    
    return () => {
      document.body.classList.remove('transparent-window');
    };
  }, []);

  // Handle window close event (for Electron)
  const handleClose = () => {
    if (window.close) {
      window.close();
    }
  };

  return (
    <WebSocketWrapper>
      <AudioProvider>
        <SessionProvider>
          <EnhancedMiniTab 
            isElectronWindow={true} 
            onClose={handleClose}
            initialPanel="summary"
          />
        </SessionProvider>
      </AudioProvider>
    </WebSocketWrapper>
  );
};

export default EnhancedMiniTabPage;
