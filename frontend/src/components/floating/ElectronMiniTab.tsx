import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/SimpleAudioContext';
import { updateMiniTabPosition } from '../../utils/electronBridge';

// Icons
import {
  MicrophoneIcon,
  PauseIcon,
  StopIcon,
  DocumentTextIcon,
  XMarkIcon,
  MinusIcon,
} from '@heroicons/react/24/solid';

const ElectronMiniTab = (): React.ReactElement => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { currentSession } = useSession();
  const { recordingStatus, startRecording, stopRecording, pauseRecording } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track position for dragging
  const startPosRef = useRef({ x: 0, y: 0 });
  
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
  
  // Handle mouse events for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    startPosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - startPosRef.current.x;
    const newY = e.clientY - startPosRef.current.y;
    
    setPosition({ x: newX, y: newY });
    
    // Update position in Electron main process
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      updateMiniTabPosition({
        x: newX,
        y: newY,
        width: rect.width,
        height: rect.height
      });
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Add global mouse event listeners for dragging
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div 
      ref={containerRef}
      className="fixed electron-mini-tab shadow-lg rounded-lg bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600 w-72 overflow-hidden z-50"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-dark-600 cursor-move bg-gray-50 dark:bg-dark-800"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center">
          <MicrophoneIcon className="h-5 w-5 text-primary-500 mr-2" />
          <h3 className="text-sm font-medium">Clarimeet</h3>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => window.close()}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          transition={{ duration: 0.2 }}
          className="p-3"
        >
          {/* Session info */}
          <div>
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

            {/* Recording controls */}
            <div className="mt-2 flex justify-center space-x-2">
              {recordingStatus?.isRecording ? (
                <>
                  <button
                    onClick={() => pauseRecording()}
                    className="p-2 rounded-full bg-yellow-100 text-yellow-600 hover:bg-yellow-200"
                  >
                    <PauseIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => stopRecording()}
                    className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200"
                  >
                    <StopIcon className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startRecording()}
                  className="p-2 rounded-full bg-primary-100 text-primary-600 hover:bg-primary-200"
                >
                  <MicrophoneIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Latest transcription */}
            {currentSession?.currentTranscriptions?.length > 0 && (
              <div className="mt-3 p-2 bg-gray-50 dark:bg-dark-600 rounded-md text-xs max-h-16 overflow-y-auto">
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
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ElectronMiniTab;
