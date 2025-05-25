import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Draggable from 'react-draggable';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/AudioContext';
import { isElectron, createMiniTab } from '../../utils/electronBridge';

// Import panel components
import { LiveSummaryPanel, AIChatbotPanel, NotebookPanel } from './panels';
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
  const [activeTab, setActiveTab] = useState<'summary' | 'chat' | 'notes'>('summary');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isExpandedByHover, setIsExpandedByHover] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isNearEdge, setIsNearEdge] = useState(false);
  const { currentSession } = useSession();
  const { recordingStatus, startRecording, stopRecording, pauseRecording } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragNodeRef = useRef(null);

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
  
  // Handle drag stop - now just tracks position without enforcing boundaries
  const handleDragStop = useCallback((e, data) => {
    const { x, y } = data;
    setPosition({ x, y });
  }, []);
  
  // Handle drag to keep track of position and check edge proximity
  const handleDrag = useCallback((e, data) => {
    const { x, y } = data;
    setPosition({ x, y });
    setIsNearEdge(checkEdgeProximity(x, y));
  }, [checkEdgeProximity]);
  
  // Effect to handle window resize events - now just tracks window size changes
  useEffect(() => {
    const handleResize = () => {
      // Just update edge proximity check on resize
      if (containerRef.current) {
        const { x, y } = position;
        setIsNearEdge(checkEdgeProximity(x, y));
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, checkEdgeProximity]);
  
  if (!isVisible) return null;

  return (
    <DraggableComponent 
      handle=".drag-handle" 
      position={position}
      onStop={handleDragStop}
      onDrag={handleDrag}
      nodeRef={dragNodeRef}>
      <motion.div
        ref={containerRef}
        className={`mini-tab shadow-lg rounded-lg bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600 overflow-hidden ${isNearEdge ? 'border-primary-500 dark:border-primary-400' : ''}`}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        onMouseEnter={() => {
          setIsHovering(true);
          // Expand after a short delay to prevent accidental expansions
          hoverTimeoutRef.current = setTimeout(() => {
            setIsExpandedByHover(true);
            setIsCollapsed(false);
          }, 200);
        }}
        onMouseLeave={() => {
          setIsHovering(false);
          // Clear any pending hover timeout
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
          // Collapse after leaving, but only if it was expanded by hover
          if (isExpandedByHover) {
            setTimeout(() => {
              setIsExpandedByHover(false);
              setIsCollapsed(true);
            }, 500); // Longer delay to give user time to move cursor back
          }
        }}
        style={{ 
          zIndex: 9999,
          boxShadow: isHovering ? '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)' : undefined
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between py-2 px-3 border-b border-gray-200 dark:border-dark-600 drag-handle cursor-move bg-gray-50 dark:bg-dark-800 transition-colors duration-200"
          ref={dragNodeRef}
        >
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
              onClick={() => {
                const newCollapsedState = !isCollapsed;
                setIsCollapsed(newCollapsedState);
                setIsExpandedByHover(false); // Manual click overrides hover behavior
              }}
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

        {/* Tabs */}
        {!isCollapsed && (
          <div className="flex border-b border-gray-200 dark:border-dark-600">
            <button
              onClick={() => setActiveTab('summary')}
              className={`flex-1 py-2 text-xs font-medium transition-colors duration-150 relative ${activeTab === 'summary'
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Summary
              {activeTab === 'summary' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 dark:bg-primary-400"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 text-xs font-medium transition-colors duration-150 relative ${activeTab === 'chat'
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              AI Chat
              {activeTab === 'chat' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 dark:bg-primary-400"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex-1 py-2 text-xs font-medium transition-colors duration-150 relative ${activeTab === 'notes'
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Notes
              {activeTab === 'notes' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 dark:bg-primary-400"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          </div>
        )}
        
        {/* Content */}
        <AnimatePresenceComponent>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1.0] }} // Using cubic-bezier for smoother animation
              className="overflow-hidden p-3"
            >
              {/* Session info - always visible at the top */}
              <div className="mb-3">
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
              
              {/* Tab Content */}
              <AnimatePresenceComponent mode="wait">
                {activeTab === 'summary' && (
                  <motion.div
                    key="summary"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
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
                  >
                    {currentSession?.session ? (
                      <AIChatbotPanel session={currentSession} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 text-gray-400 dark:text-gray-500">
                        <DocumentTextIcon className="h-10 w-10 mb-2 opacity-50" />
                        <p className="text-sm">No active session</p>
                        <p className="text-xs mt-1">Start recording to chat with AI</p>
                      </div>
                    )}
                  </motion.div>
                )}
                
                {activeTab === 'notes' && (
                  <motion.div
                    key="notes"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {currentSession?.session ? (
                      <NotebookPanel session={currentSession} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 text-gray-400 dark:text-gray-500">
                        <DocumentTextIcon className="h-10 w-10 mb-2 opacity-50" />
                        <p className="text-sm">No active session</p>
                        <p className="text-xs mt-1">Start recording to take notes</p>
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
