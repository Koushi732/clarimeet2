import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../../contexts/SessionContext';
import { updateStatusPanelPosition } from '../../utils/electronBridge';

// Icons
import {
  ChartBarIcon,
  XMarkIcon,
  MinusIcon,
  DocumentTextIcon,
  ClockIcon,
  DocumentIcon,
} from '@heroicons/react/24/solid';

const ElectronStatusPanel = (): React.ReactElement => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { currentSession } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track position for dragging
  const startPosRef = useRef({ x: 0, y: 0 });
  
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
      updateStatusPanelPosition({
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

  // Format timestamp
  const formatTime = (timestamp: number): string => {
    if (!timestamp) return '--:--';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Count words in text
  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  return (
    <div 
      ref={containerRef}
      className="fixed electron-status-panel shadow-lg rounded-lg bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600 w-96 overflow-hidden z-50"
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
          <ChartBarIcon className="h-5 w-5 text-primary-500 mr-2" />
          <h3 className="text-sm font-medium">Session Status</h3>
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
          {!currentSession?.session ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-4">
              No active session
            </div>
          ) : (
            <>
              {/* Session info */}
              <div className="mb-3">
                <h4 className="text-sm font-medium mb-1">{currentSession.session.title || 'Untitled Session'}</h4>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {currentSession.session.description || 'No description'}
                </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-50 dark:bg-dark-600 p-2 rounded">
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <ClockIcon className="h-3 w-3 mr-1" /> Duration
                  </div>
                  <div className="text-sm font-medium">
                    {Math.floor(currentSession.session.duration / 60)}m {Math.floor(currentSession.session.duration % 60)}s
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-dark-600 p-2 rounded">
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <DocumentTextIcon className="h-3 w-3 mr-1" /> Transcription
                  </div>
                  <div className="text-sm font-medium">
                    {currentSession.currentTranscriptions?.length || 0} segments
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-dark-600 p-2 rounded">
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <DocumentIcon className="h-3 w-3 mr-1" /> Word Count
                  </div>
                  <div className="text-sm font-medium">
                    {countWords(currentSession.currentTranscriptions?.map(t => t.text).join(' ') || '')}
                  </div>
                </div>
              </div>
              
              {/* Latest summary */}
              {currentSession.currentSummaries?.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-primary-700 dark:text-primary-400 mb-1">
                    Latest Summary
                  </div>
                  <div className="bg-primary-50 dark:bg-dark-800 p-2 rounded-md text-xs max-h-32 overflow-y-auto">
                    {currentSession.currentSummaries[
                      currentSession.currentSummaries.length - 1
                    ].text}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default ElectronStatusPanel;
