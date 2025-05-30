import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Draggable from 'react-draggable';
import { useSession } from '../../contexts/SessionContext';
import { isElectron, createStatusPanel } from '../../utils/electronBridge';
import { useAudio } from '../../contexts/SimpleAudioContext';

// Icons
import {
  MicrophoneIcon,
  DocumentTextIcon,
  DocumentMagnifyingGlassIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
  ChevronDoubleUpIcon,
  ChevronDoubleDownIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/solid';

const StatusPanel: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const { currentSession } = useSession();
  const { recordingStatus } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Launch floating Electron window when requested
  const launchElectronWindow = () => {
    if (isElectron() && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      createStatusPanel({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      });
      // Hide in-app version after creating floating window
      setIsVisible(false);
    }
  };

  // Don't show if no active session or not visible
  if (!currentSession?.session || !isVisible) {
    return null;
  }

  // Status indicators
  const getRecordingStatus = () => {
    if (recordingStatus?.isRecording) {
      return {
        icon: <MicrophoneIcon className="h-5 w-5 text-red-500 animate-pulse" />,
        text: 'Recording',
        color: 'text-red-500',
      };
    }
    
    return {
      icon: <MicrophoneIcon className="h-5 w-5 text-gray-400" />,
      text: 'Not Recording',
      color: 'text-gray-500',
    };
  };

  const getTranscriptionStatus = () => {
    if (!currentSession.transcriptionStatus) {
      return {
        icon: <DocumentTextIcon className="h-5 w-5 text-gray-400" />,
        text: 'Not Started',
        color: 'text-gray-500',
      };
    }

    const status = currentSession.transcriptionStatus.status;

    if (status === 'transcribing' || status === 'processing') {
      return {
        icon: <DocumentTextIcon className="h-5 w-5 text-yellow-500 animate-pulse" />,
        text: 'Transcribing',
        color: 'text-yellow-500',
      };
    } else if (status === 'completed') {
      return {
        icon: <CheckCircleIcon className="h-5 w-5 text-green-500" />,
        text: 'Transcribed',
        color: 'text-green-500',
      };
    } else if (status === 'error') {
      return {
        icon: <ExclamationCircleIcon className="h-5 w-5 text-red-500" />,
        text: 'Error',
        color: 'text-red-500',
      };
    }

    return {
      icon: <DocumentTextIcon className="h-5 w-5 text-gray-400" />,
      text: status,
      color: 'text-gray-500',
    };
  };

  const getSummarizationStatus = () => {
    if (!currentSession.summarizationStatus) {
      return {
        icon: <DocumentMagnifyingGlassIcon className="h-5 w-5 text-gray-400" />,
        text: 'Not Started',
        color: 'text-gray-500',
      };
    }

    const status = currentSession.summarizationStatus.status;

    if (status === 'generating' || status === 'running') {
      return {
        icon: (
          <DocumentMagnifyingGlassIcon className="h-5 w-5 text-blue-500 animate-pulse" />
        ),
        text: 'Summarizing',
        color: 'text-blue-500',
      };
    } else if (status === 'completed') {
      return {
        icon: <CheckCircleIcon className="h-5 w-5 text-green-500" />,
        text: 'Summarized',
        color: 'text-green-500',
      };
    } else if (status === 'error') {
      return {
        icon: <ExclamationCircleIcon className="h-5 w-5 text-red-500" />,
        text: 'Error',
        color: 'text-red-500',
      };
    }

    return {
      icon: <DocumentMagnifyingGlassIcon className="h-5 w-5 text-gray-400" />,
      text: status,
      color: 'text-gray-500',
    };
  };

  const recordingStatusDisplay = getRecordingStatus();
  const transcriptionStatus = getTranscriptionStatus();
  const summarizationStatus = getSummarizationStatus();

  return (
    <motion.div
      ref={containerRef}
      className="status-panel shadow-lg rounded-lg bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      <div className="container mx-auto">
        <div className="flex items-center justify-between">
          {/* Session title */}
          <div className="font-medium truncate max-w-xs">
            {currentSession.session.title || 'Untitled Session'}
          </div>

          {/* Status indicators */}
          {!isCollapsed && (
            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                {recordingStatusDisplay.icon}
                <span className={`ml-1 text-sm ${recordingStatusDisplay.color}`}>
                  {recordingStatusDisplay.text}
                </span>
              </div>

              <div className="flex items-center">
                {transcriptionStatus.icon}
                <span className={`ml-1 text-sm ${transcriptionStatus.color}`}>
                  {transcriptionStatus.text}
                </span>
              </div>

              <div className="flex items-center">
                {summarizationStatus.icon}
                <span className={`ml-1 text-sm ${summarizationStatus.color}`}>
                  {summarizationStatus.text}
                </span>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center space-x-2">
            {isElectron() && (
              <button
                onClick={launchElectronWindow}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Launch as floating window"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {isCollapsed ? (
                <ChevronDoubleDownIcon className="h-4 w-4" />
              ) : (
                <ChevronDoubleUpIcon className="h-4 w-4" />
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
      </div>
    </motion.div>
  );
};

export default StatusPanel;
