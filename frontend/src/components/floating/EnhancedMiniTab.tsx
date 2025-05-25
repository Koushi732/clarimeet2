import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Draggable from 'react-draggable';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/AudioContext';
import { updateMiniTabPosition } from '../../utils/electronBridge';

// Import panel components
import { LiveSummaryPanel, AIChatbotPanel, NotebookPanel } from './panels';

// Icons
import {
  MicrophoneIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  PencilIcon,
  XMarkIcon,
  MinusIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/solid';

// Panel types for the MiniTab
export type MiniTabPanel = 'summary' | 'chatbot' | 'notebook';

interface EnhancedMiniTabProps {
  initialPanel?: MiniTabPanel;
  onClose?: () => void;
  isElectronWindow?: boolean;
}

const EnhancedMiniTab: React.FC<EnhancedMiniTabProps> = ({
  initialPanel = 'summary',
  onClose = () => {},
  isElectronWindow = false,
}) => {
  const [activePanel, setActivePanel] = useState<MiniTabPanel>(initialPanel);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { currentSession } = useSession();
  const { recordingStatus } = useAudio();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Position state for dragging in electron window
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
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
  
  // Dragging functionality for Electron window
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isElectronWindow || !containerRef.current) return;
    
    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    startPosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isElectronWindow || !isDragging) return;
    
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
    if (isElectronWindow) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isElectronWindow]);

  // Determine container classes based on state
  const containerClasses = `
    enhanced-mini-tab
    ${isElectronWindow ? 'fixed' : 'absolute'}
    ${isExpanded ? 'w-96' : 'w-72'}
    shadow-lg rounded-lg bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 overflow-hidden z-50
    transition-all duration-300 ease-in-out
  `;

  // Render active panel content
  const renderPanelContent = () => {
    switch (activePanel) {
      case 'summary':
        return <LiveSummaryPanel session={currentSession} />;
      case 'chatbot':
        return <AIChatbotPanel session={currentSession} />;
      case 'notebook':
        return <NotebookPanel session={currentSession} />;
      default:
        return <LiveSummaryPanel session={currentSession} />;
    }
  };
  
  // Base component for Electron Window or in-app component
  const MiniTabContent = (
    <div
      ref={containerRef}
      className={containerClasses}
      style={isElectronWindow ? { left: `${position.x}px`, top: `${position.y}px` } : {}}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-dark-600 cursor-move bg-gray-50 dark:bg-dark-800"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center">
          <MicrophoneIcon className="h-5 w-5 text-primary-500 mr-2" />
          <h3 className="text-sm font-medium">
            Clarimeet
            {recordingStatus?.isRecording && (
              <span className="ml-2 text-xs font-mono bg-red-100 text-red-600 px-1 py-0.5 rounded animate-pulse">
                {formatTime(elapsedTime)}
              </span>
            )}
          </h3>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title={isExpanded ? "Shrink" : "Expand"}
          >
            {isExpanded ? (
              <ArrowsPointingInIcon className="h-4 w-4" />
            ) : (
              <ArrowsPointingOutIcon className="h-4 w-4" />
            )}
          </button>
          
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-between p-1 bg-gray-100 dark:bg-dark-700">
        <button
          onClick={() => setActivePanel('summary')}
          className={`flex-1 flex items-center justify-center p-2 rounded-md text-xs font-medium transition-colors duration-150 ease-in-out ${
            activePanel === 'summary'
              ? 'bg-primary-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
          }`}
        >
          <ChartBarIcon className="h-4 w-4 mr-1" />
          Summary
        </button>
        
        <button
          onClick={() => setActivePanel('chatbot')}
          className={`flex-1 flex items-center justify-center p-2 rounded-md text-xs font-medium transition-colors duration-150 ease-in-out ${
            activePanel === 'chatbot'
              ? 'bg-primary-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
          }`}
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" />
          AI Chat
        </button>
        
        <button
          onClick={() => setActivePanel('notebook')}
          className={`flex-1 flex items-center justify-center p-2 rounded-md text-xs font-medium transition-colors duration-150 ease-in-out ${
            activePanel === 'notebook'
              ? 'bg-primary-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
          }`}
        >
          <PencilIcon className="h-4 w-4 mr-1" />
          Notes
        </button>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.div
            key={activePanel}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 max-h-80 overflow-y-auto">
              {renderPanelContent()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // For in-app use (wrapped in Draggable)
  if (!isElectronWindow) {
    return (
      <div className="draggable-wrapper">
        {MiniTabContent}
      </div>
    );
  }
  
  // For Electron window use (directly return)
  return MiniTabContent;
};

export default EnhancedMiniTab;
