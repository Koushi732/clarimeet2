import React, { useState, useEffect, useRef } from 'react';
import { ChartBarIcon, XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/solid';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/AudioContext';
import { useWebSocketBridge, WebSocketMessageType, MessageTypes } from '../../contexts/WebSocketContextBridge';

/**
 * A floating panel that displays real-time meeting summaries
 * Companion to the FloatingTranscriptionPanel
 */
const FloatingSummaryPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [summaries, setSummaries] = useState<any[]>([]);
  const { currentSession } = useSession();
  const { recordingStatus } = useAudio();
  const { lastMessage, addMessageHandler } = useWebSocketBridge();
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Automatically show the panel when recording starts
  useEffect(() => {
    if (recordingStatus?.isRecording) {
      setIsVisible(true);
      // Load existing summaries if available
      if (summaries.length === 0 && currentSession?.currentSummaries?.length) {
        setSummaries(currentSession.currentSummaries);
      }
    } else {
      setIsVisible(false);
    }
  }, [recordingStatus, currentSession?.currentSummaries, summaries.length]);
  
  // Handle WebSocket messages for summary updates
  useEffect(() => {
    if (!lastMessage) return;
    
    // Process summary updates
    if (lastMessage.type === 'summary_update' && lastMessage.data) {
      console.log('Received summary update:', lastMessage.data);
      const newSummary = {
        id: lastMessage.data.id || `summary-${Date.now()}`,
        text: lastMessage.data.text || '',
        timestamp: lastMessage.data.timestamp || Math.floor(Date.now() / 1000),
        summary_type: lastMessage.data.summary_type || 'incremental'
      };
      
      setSummaries(prev => [...prev, newSummary]);
    }
  }, [lastMessage]);
  
  // Register direct message handler for summary updates
  useEffect(() => {
    // Add direct message handler
    const removeHandler = addMessageHandler(MessageTypes.SUMMARY_UPDATE, (data) => {
      console.log('Direct summary handler received data:', data);
      if (!data) return;
      
      const newSummary = {
        id: data.id || `summary-${Date.now()}`,
        text: data.text || '',
        timestamp: data.timestamp || Math.floor(Date.now() / 1000),
        summary_type: data.summary_type || 'incremental'
      };
      
      setSummaries(prev => [...prev, newSummary]);
    });
    
    return () => {
      removeHandler();
    };
  }, [addMessageHandler]);
  
  // Handle drag functionality
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 330, y: 0 });  // Position to the right of transcription panel
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartPos.current = { 
      x: e.clientX - position.x, 
      y: e.clientY - position.y 
    };
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragStartPos.current.x,
      y: e.clientY - dragStartPos.current.y
    });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Add global event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  // Close panel
  const handleClose = () => {
    setIsVisible(false);
  };
  
  // Toggle minimize
  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };
  
  // Generate summary manually
  const handleGenerateSummary = async () => {
    if (currentSession?.session?.id && currentSession.generateSummary) {
      try {
        await currentSession.generateSummary(currentSession.session.id, 'incremental');
      } catch (error) {
        console.error('Failed to generate summary:', error);
      }
    }
  };
  
  if (!isVisible) return null;
  
  // Determine if we have summaries using local state
  const hasSummaries = summaries && summaries.length > 0;
  
  // Position panel with transform only to avoid conflicts
  const panelStyle = {
    transform: `translate(${position.x}px, ${position.y}px)`
  };
  
  return (
    <div 
      ref={panelRef}
      style={panelStyle}
      className="fixed bottom-4 right-4 z-[9999] w-80 shadow-lg rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* Header - Draggable */}
      <div 
        className="bg-blue-600 text-white p-2 flex justify-between items-center cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center">
          <ChartBarIcon className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">Live Summary</span>
        </div>
        
        <div className="flex space-x-1">
          <button 
            onClick={handleGenerateSummary}
            className="p-1 hover:bg-blue-500 rounded"
            title="Generate summary"
            disabled={!currentSession?.session?.id}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button 
            onClick={handleToggleMinimize}
            className="p-1 hover:bg-blue-500 rounded"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? "+" : "-"}
          </button>
          
          <button 
            onClick={handleClose}
            className="p-1 hover:bg-blue-500 rounded"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      
      {/* Content */}
      {!isMinimized && (
        <div className="p-3 max-h-60 overflow-y-auto bg-white dark:bg-gray-800">
          {!hasSummaries ? (
            <div className="flex flex-col items-center justify-center py-4 text-gray-500">
              <ChartBarIcon className="h-8 w-8 mb-2 animate-pulse text-blue-500" />
              <p className="text-sm">Waiting for summaries...</p>
              <p className="text-xs mt-1">
                Generate a summary by clicking the refresh button above
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {summaries.map((summary: any, index: number) => (
                <div key={summary.id || index} className="text-sm group">
                  <div className="flex items-start space-x-2">
                    <DocumentTextIcon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between items-center text-xs text-blue-800 dark:text-blue-200 mb-1">
                        <div className="flex items-center">
                          {new Date(summary.timestamp * 1000).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit'
                          })}
                          {summary.summary_type && (
                            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full text-xs">
                              {summary.summary_type}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-gray-800 dark:text-gray-200 whitespace-pre-line">{summary.text}</div>
                    </div>
                  </div>
                  {index < currentSession.currentSummaries.length - 1 && (
                    <div className="border-b border-gray-200 dark:border-gray-700 my-3"></div>
                  )}
                </div>
              ))}
              
              {currentSession?.summarizationStatus?.status === 'generating' && (
                <div className="flex items-center justify-center py-2">
                  <div className="animate-pulse flex space-x-1">
                    <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                    <div className="h-2 w-2 bg-blue-500 rounded-full delay-75"></div>
                    <div className="h-2 w-2 bg-blue-500 rounded-full delay-150"></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingSummaryPanel;
