import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Draggable from 'react-draggable';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/AudioContext';
import { isElectron, createMiniTab } from '../../utils/electronBridge';
// Icons
import {
  MicrophoneIcon,
  PauseIcon,
  StopIcon,
  DocumentTextIcon,
  DocumentIcon,
  XMarkIcon,
  MinusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/solid';

// Fix type issues with 3rd party components
const DraggableComponent = Draggable as any;
const AnimatePresenceComponent = AnimatePresence as any;

const MiniTab = (): React.ReactElement => {
  const [isVisible, setIsVisible] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { currentSession } = useSession();
  const { recordingStatus, startRecording, stopRecording, pauseRecording } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);

  // Update elapsed time during recording
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (recordingStatus?.isRecording) {
      interval = setInterval(() => {
        setElapsedTime(recordingStatus.duration);
      }, 1000);
    } else if (currentSession?.session) {
      setElapsedTime(currentSession.session.duration);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingStatus, currentSession]);

  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Show audio level visualization
  const renderAudioLevel = () => {
    const level = recordingStatus?.audioLevel || 0;
    const bars = 10;
    const activeBars = Math.floor(level * bars);

    return (
      <div className="flex items-center h-4 space-x-1">
        {[...Array(bars)].map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-full ${
              i < activeBars
                ? 'bg-primary-500 animate-pulse'
                : 'bg-gray-300 dark:bg-dark-500'
            }`}
            style={{ height: `${Math.min(100, (i + 1) * 10)}%` }}
          />
        ))}
      </div>
    );
  };

  // Launch floating Electron window when requested
  const launchElectronWindow = () => {
    if (isElectron() && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      createMiniTab({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      });
      // Hide in-app version after creating floating window
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <DraggableComponent handle=".drag-handle" bounds="parent">
      <motion.div
        ref={containerRef}
        className="mini-tab shadow-lg rounded-lg bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600 overflow-hidden"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-dark-600 drag-handle cursor-move">
          <div className="flex items-center">
            <MicrophoneIcon className="h-5 w-5 text-primary-500 mr-2" />
            <h3 className="text-sm font-medium">Clarimeet</h3>
          </div>
          <div className="flex items-center space-x-1">
            {isElectron() && (
              <button
                onClick={launchElectronWindow}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Launch as floating window"
              >
                <DocumentIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {isCollapsed ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <AnimatePresenceComponent>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Session info */}
              <div className="mt-3">
                <div className="flex justify-between items-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {recordingStatus?.isRecording
                      ? 'Recording...'
                      : currentSession?.session
                      ? 'Current Session'
                      : 'No active session'}
                  </div>
                  <div className="text-xs font-mono bg-gray-100 dark:bg-dark-600 px-2 py-0.5 rounded">
                    {formatTime(elapsedTime)}
                  </div>
                </div>

                {/* Session title */}
                {(recordingStatus?.isRecording || currentSession?.session) && (
                  <div className="mt-1 text-sm font-medium truncate">
                    {currentSession?.session?.title || 'Untitled Session'}
                  </div>
                )}

                {/* Audio visualization */}
                {recordingStatus?.isRecording && (
                  <div className="mt-2">{renderAudioLevel()}</div>
                )}

                {/* Latest transcription */}
                {currentSession?.currentTranscriptions?.length > 0 && (
                  <div className="mt-3 p-2 bg-gray-50 dark:bg-dark-600 rounded-md text-xs max-h-20 overflow-y-auto">
                    <div className="flex items-start space-x-1">
                      <DocumentTextIcon className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        {currentSession.currentTranscriptions[
                          currentSession.currentTranscriptions.length - 1
                        ].text}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary snippet */}
                {currentSession?.currentSummaries?.length > 0 && (
                  <div className="mt-2 p-2 bg-primary-50 dark:bg-dark-800 rounded-md text-xs max-h-20 overflow-y-auto">
                    <div className="text-xs font-medium text-primary-700 dark:text-primary-400 mb-1">
                      Latest Summary
                    </div>
                    <div>
                      {currentSession.currentSummaries[
                        currentSession.currentSummaries.length - 1
                      ].text}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresenceComponent>
      </motion.div>
    </DraggableComponent>
  );
};

export default MiniTab;
