import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Draggable from 'react-draggable';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/SimpleAudioContext';
import { DatabaseService } from '../../services/DatabaseService';
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

const ImprovedMiniTab = (): React.ReactElement => {
  const [isVisible, setIsVisible] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'summary' | 'chat'>('summary');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isExpandedByHover, setIsExpandedByHover] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savePositionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isNearEdge, setIsNearEdge] = useState(false);
  const { currentSession } = useSession();
  const { recordingStatus, startRecording, stopRecording } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragNodeRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const userId = 'default-user'; // In a real app, this would come from auth context

  // Load saved position from database or localStorage
  const loadSavedPosition = useCallback(async () => {
    setIsLoading(true);
    try {
      // Try to load from session settings first (if we have a session)
      if (currentSession?.session?.id) {
        const sessionId = currentSession.session.id;
        const positionSetting = await DatabaseService.getSessionSetting(sessionId, 'miniTabPosition');
        if (positionSetting && positionSetting.value) {
          setPosition(positionSetting.value);
          setIsLoading(false);
          return;
        }
      }
      
      // Try to load from user settings as fallback
      if (userId) {
        const userSettings = await DatabaseService.getUserSettings(userId);
        if (userSettings && userSettings.miniTabPosition) {
          setPosition(userSettings.miniTabPosition);
          // If we have a session, migrate this setting to session settings
          if (currentSession?.session?.id) {
            await DatabaseService.saveSessionSetting(
              currentSession.session.id, 
              'miniTabPosition', 
              userSettings.miniTabPosition
            );
          }
          setIsLoading(false);
          return;
        }
      }
      
      // Final fallback to localStorage
      const savedPosition = localStorage.getItem('clarimeet_minitab_position');
      if (savedPosition) {
        try {
          const parsedPosition = JSON.parse(savedPosition);
          setPosition(parsedPosition);
          // If we have a session, save this to session settings for future use
          if (currentSession?.session?.id) {
            await DatabaseService.saveSessionSetting(
              currentSession.session.id, 
              'miniTabPosition', 
              parsedPosition
            );
          }
        } catch (e) {
          console.error('Failed to parse saved position:', e);
        }
      }
    } catch (error) {
      console.error('Error loading saved position:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentSession?.session?.id]);
  
  // Save position to database with debounce
  const savePosition = useCallback(async (newPosition: {x: number, y: number}) => {
    // Clear any existing timeout to prevent multiple rapid saves
    if (savePositionTimeoutRef.current) {
      clearTimeout(savePositionTimeoutRef.current);
    }
    
    // Set new timeout to save position after a delay (debounce)
    savePositionTimeoutRef.current = setTimeout(async () => {
      try {
        // Save to session settings if we have a session (preferred)
        if (currentSession?.session?.id) {
          await DatabaseService.saveSessionSetting(
            currentSession.session.id,
            'miniTabPosition',
            newPosition
          );
        }
        
        // Save to user settings as backup
        if (userId) {
          // Get current settings first
          const userSettings = await DatabaseService.getUserSettings(userId) || {};
          
          // Update with new position
          await DatabaseService.saveUserSettings(userId, {
            ...userSettings,
            miniTabPosition: newPosition
          });
        }
        
        // Backup to localStorage for offline access
        localStorage.setItem('clarimeet_minitab_position', JSON.stringify(newPosition));
      } catch (error) {
        console.error('Error saving position:', error);
      }
    }, 500); // 500ms debounce
  }, [userId, currentSession?.session?.id]);

  // Load saved position on component mount
  useEffect(() => {
    loadSavedPosition();
  }, [loadSavedPosition]);
  
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
    
    // If the mini tab is collapsed, we'll auto-expand it after a short delay
    if (isCollapsed) {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      
      // Set a timeout to expand after 500ms of hovering
      hoverTimeoutRef.current = setTimeout(() => {
        setIsExpandedByHover(true);
      }, 500);
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
    
    // If the tab was expanded by hover, collapse it with a slight delay
    // This prevents flickering when moving mouse between elements
    if (isExpandedByHover) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsExpandedByHover(false);
      }, 300);
    }
  }, [isExpandedByHover]);

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
  
  // Handle recording control
  const toggleRecording = () => {
    if (recordingStatus?.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <DraggableComponent
      defaultPosition={{ x: window.innerWidth - 350, y: 100 }}
      onDrag={(e, data) => {
        const isNear = checkEdgeProximity(data.x, data.y);
        if (isNear !== isNearEdge) {
          setIsNearEdge(isNear);
        }
        const newPosition = { x: data.x, y: data.y };
        setPosition(newPosition);
        // Save position when drag stops
      }}
      onStop={(e, data) => {
        // Save the final position to database/localStorage
        const newPosition = { x: data.x, y: data.y };
        savePosition(newPosition);
      }}
      handle=".drag-handle"
    >
      <div ref={dragNodeRef}>
        <motion.div
          ref={containerRef}
          className={`fixed z-30 ${
            isCollapsed && !isExpandedByHover ? 'w-16' : 'w-80'
          } ${isNearEdge ? 'right-0' : ''} shadow-xl bg-white dark:bg-dark-800 rounded-lg overflow-hidden transition-all duration-300 ease-in-out`}
          style={{
            height: isCollapsed && !isExpandedByHover ? '40px' : '400px',
            top: '5rem',
            right: isNearEdge ? '0' : position.x,
            bottom: 'auto',
            opacity: isVisible ? 1 : 0,
            pointerEvents: isVisible ? 'auto' : 'none',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header with controls */}
          <div className="drag-handle flex items-center justify-between bg-primary-500 dark:bg-primary-700 text-white p-2 cursor-move">
            <div className="flex items-center">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-primary-500 mr-2">
                <MicrophoneIcon className="h-5 w-5" />
              </div>
              <span className="font-medium">Clarimeet</span>
            </div>
            
            <div className="flex items-center space-x-1">
              {/* Recording control */}
              <button
                className="p-1 rounded-full hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors"
                onClick={toggleRecording}
                title={recordingStatus?.isRecording ? "Stop Recording" : "Start Recording"}
              >
                {recordingStatus?.isRecording ? (
                  <StopIcon className="h-5 w-5" />
                ) : (
                  <MicrophoneIcon className="h-5 w-5" />
                )}
              </button>
              
              {/* Collapse/Expand button */}
              <button
                className="p-1 rounded-full hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? (
                  <ChevronDownIcon className="h-5 w-5" />
                ) : (
                  <ChevronUpIcon className="h-5 w-5" />
                )}
              </button>
              
              {/* Electron floating window button - only show in Electron */}
              {isElectron() && (
                <button
                  className="p-1 rounded-full hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors"
                  onClick={launchElectronWindow}
                  title="Launch as separate window"
                >
                  <MinusIcon className="h-5 w-5" />
                </button>
              )}
              
              {/* Close button */}
              <button
                className="p-1 rounded-full hover:bg-primary-400 dark:hover:bg-primary-600 transition-colors"
                onClick={() => setIsVisible(false)}
                title="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          {/* Content area */}
          <AnimatePresenceComponent>
            {(!isCollapsed || isExpandedByHover) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col h-full"
              >
                {/* Session info */}
                <div className="p-3 border-b border-gray-200 dark:border-dark-600">
                  {/* Recording status & timer */}
                  <div className="flex items-center">
                    <div
                      className={`w-3 h-3 rounded-full mr-2 ${
                        recordingStatus?.isRecording
                          ? 'bg-red-500 animate-pulse'
                          : 'bg-gray-400 dark:bg-gray-600'
                      }`}
                    />
                    <div className="text-xs font-medium">
                      {recordingStatus?.isRecording ? 'Recording' : 'Not Recording'}
                    </div>
                    <div className="ml-auto text-xs font-mono">
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
                
                {/* Tab buttons */}
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
                
                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto">
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
                </div>
              </motion.div>
            )}
          </AnimatePresenceComponent>
        </motion.div>
      </div>
    </DraggableComponent>
  );
};

export default ImprovedMiniTab;
