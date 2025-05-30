import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Draggable from 'react-draggable';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/SimpleAudioContext';
import { isElectron, createMiniTab } from '../../utils/electronBridge';

// Import panel components - only include the core features
import { LiveSummaryPanel, AIChatbotPanel } from './panels';
// Icons
import {
  MicrophoneIcon,
  StopIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
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
  const [activeTab, setActiveTab] = useState<'summary' | 'chat'>('summary');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isExpandedByHover, setIsExpandedByHover] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isNearEdge, setIsNearEdge] = useState(false);
  const { currentSession } = useSession();
  const { recordingStatus, startRecording, stopRecording } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragNodeRef = useRef<HTMLDivElement>(null);

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
  
  // If the active tab is summary, but there are no summaries yet and transcriptions are available,
  // show the transcriptions tab instead
  useEffect(() => {
    if (activeTab === 'summary' && 
        currentSession?.currentSummaries?.length === 0 && 
        currentSession?.currentTranscriptions?.length > 0) {
      // Switch to transcriptions tab automatically
      setActiveTab('chat');
    }
  }, [currentSession?.currentSummaries, currentSession?.currentTranscriptions, activeTab]);

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

  // Handle mouse enter for hover effects
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (isCollapsed) {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      // Set timeout to expand the tab after a short delay
      hoverTimeoutRef.current = setTimeout(() => {
        setIsExpandedByHover(true);
      }, 300); // 300ms delay before expanding
    }
  }, [isCollapsed]);

  // Handle mouse leave for hover effects
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Collapse the tab after leaving
    setIsExpandedByHover(false);
  }, []);
  
  // Check if component is near window edge for snap behavior
  const checkEdgeProximity = useCallback((x: number, y: number) => {
    if (!containerRef.current) return false;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const rect = containerRef.current.getBoundingClientRect();
    const edgeThreshold = 20; // pixels from edge to activate snap
    
    const isNearRightEdge = windowWidth - (x + rect.width) < edgeThreshold;
    const isNearLeftEdge = x < edgeThreshold;
    const isNearTopEdge = y < edgeThreshold;
    const isNearBottomEdge = windowHeight - (y + rect.height) < edgeThreshold;
    
    return isNearRightEdge || isNearLeftEdge || isNearTopEdge || isNearBottomEdge;
  }, []);

  // Handle window resize for edge detection
  const handleResize = useCallback(() => {
    if (position.x > 0 || position.y > 0) {
      setIsNearEdge(checkEdgeProximity(position.x, position.y));
    }
  }, [position, checkEdgeProximity]);

  // Add resize event listener
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  if (!isVisible) return null;

  return (
    <DraggableComponent
      position={position}
      onStop={(e, data) => {
        setPosition({ x: data.x, y: data.y });
        setIsNearEdge(checkEdgeProximity(data.x, data.y));
      }}
      onDrag={(e, data) => setIsNearEdge(checkEdgeProximity(data.x, data.y))}
      nodeRef={dragNodeRef}
      handle=".drag-handle"
      bounds="parent"
    >
      <motion.div
        ref={containerRef}
        className={`fixed z-30 ${isCollapsed ? 'w-16' : 'w-80'} ${isNearEdge ? 'right-0' : ''} shadow-xl bg-white dark:bg-dark-800 rounded-lg overflow-hidden transition-all duration-300 ease-in-out`}
        style={{
          height: isCollapsed ? '40px' : '400px',
          top: '5rem',
          right: isNearEdge ? '0' : position.x,
          bottom: 'auto',
          opacity: isVisible ? 1 : 0,
          pointerEvents: isVisible ? 'auto' : 'none',
        }}
        onMouseEnter={handleMouseEnter}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{
          opacity: isVisible ? 1 : 0,
          scale: isVisible ? 1 : 0.9,
          height: isCollapsed ? 40 : 'auto',
        }}
        transition={{ duration: 0.2 }}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div ref={dragNodeRef} className="drag-handle p-2 flex justify-between items-center bg-gray-50 dark:bg-dark-700 border-b border-gray-200 dark:border-dark-600 cursor-move">
          <div className="flex items-center space-x-2">
            {recordingStatus?.isRecording ? (
              <div className="flex space-x-1">
                <button
                  onClick={() => stopRecording(recordingStatus.sessionId!)}
                  className="p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
                  title="Stop Recording"
                >
                  <StopIcon className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startRecording('New Session')}
                className="p-1 bg-primary-100 text-primary-600 rounded-full hover:bg-primary-200 dark:bg-primary-900 dark:text-primary-300 dark:hover:bg-primary-800"
                title="Start Recording"
              >
                <MicrophoneIcon className="h-3 w-3" />
              </button>
            )}
            <span className="text-sm font-medium">Clarimeet</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
            {isElectron() && (
              <button
                onClick={launchElectronWindow}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Open in Window"
              >
                <MinusIcon className="h-4 w-4" />
              </button>
            )}
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
          {(!isCollapsed || isExpandedByHover) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              {/* Session info */}
              <div className="p-3 pt-2">
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
              </div>
              
              {/* Tab buttons - only showing core features */}
              <div className="flex w-full border-b border-gray-200 dark:border-dark-600">
                <button
                  className={`flex items-center px-3 py-2 text-sm font-medium ${activeTab === 'summary' ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  onClick={() => setActiveTab('summary')}
                >
                  <DocumentTextIcon className="h-4 w-4 mr-1" />
                  Live Summary
                </button>
                <button
                  className={`flex items-center px-3 py-2 text-sm font-medium ${activeTab === 'chat' ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  onClick={() => setActiveTab('chat')}
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" />
                  Chatbot
                </button>
              </div>
              
              {/* Tab Content - only core features */}
              <AnimatePresenceComponent mode="wait">
                {activeTab === 'summary' && (
                  <motion.div
                    key="summary"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="p-3"
                  >
                    {currentSession?.session ? (
                      <LiveSummaryPanel session={currentSession} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 text-gray-400 dark:text-gray-500">
                        <DocumentTextIcon className="h-10 w-10 mb-2 opacity-50" />
                        <p className="text-sm">No active session</p>
                        <p className="text-xs mt-1">Start recording to see live summaries</p>
                      </div>
                    )}
                  </motion.div>
                )}
                
                {activeTab === 'chat' && (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="p-3"
                  >
                    {currentSession?.session ? (
                      <AIChatbotPanel session={currentSession} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 text-gray-400 dark:text-gray-500">
                        <ChatBubbleLeftRightIcon className="h-10 w-10 mb-2 opacity-50" />
                        <p className="text-sm">No active session</p>
                        <p className="text-xs mt-1">Start recording to chat with AI</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresenceComponent>
            </motion.div>
          )}
        </AnimatePresenceComponent>
      </motion.div>
    </DraggableComponent>
  );
};

export default MiniTab;
