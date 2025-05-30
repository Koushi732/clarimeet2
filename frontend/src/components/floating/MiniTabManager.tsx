import React, { useState, useEffect } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/SimpleAudioContext';
import EnhancedMiniTab from './EnhancedMiniTab';
import { isElectron } from '../../utils/electronBridge';

interface MiniTabManagerProps {
  autoShow?: boolean;
}

const MiniTabManager: React.FC<MiniTabManagerProps> = ({ autoShow = false }) => {
  const [showMiniTab, setShowMiniTab] = useState(autoShow);
  const { currentSession } = useSession();
  const { recordingStatus } = useAudio();

  // Show mini tab automatically when recording starts
  useEffect(() => {
    if (recordingStatus?.isRecording && !showMiniTab) {
      setShowMiniTab(true);
    }
  }, [recordingStatus, showMiniTab]);

  // Handle toggle mini tab
  const toggleMiniTab = () => {
    setShowMiniTab(!showMiniTab);
  };

  // Close mini tab
  const closeMiniTab = () => {
    setShowMiniTab(false);
  };

  // Don't render in Electron as it will be handled by the main process
  if (isElectron()) {
    return null;
  }

  // If recording is active, always show the mini tab
  if (recordingStatus?.isRecording) {
    // Force show the mini tab if recording is active
    if (!showMiniTab) {
      setShowMiniTab(true);
    }
  }
  
  // Only show mini tab button if it's not visible and we're not recording
  if (!showMiniTab) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999]">
        <button
          onClick={toggleMiniTab}
          className="bg-primary-500 hover:bg-primary-600 text-white p-3 rounded-full shadow-lg flex items-center justify-center"
          title="Show live transcription and summary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-8 z-[9999]">
      <EnhancedMiniTab
        initialPanel="transcription"
        onClose={closeMiniTab}
      />
    </div>
  );
};

export default MiniTabManager;
