import React, { useState, useEffect, useRef } from 'react';
import { MicrophoneIcon, XMarkIcon, UserIcon } from '@heroicons/react/24/solid';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/SimpleAudioContext';
import { useWebSocketBridge, WebSocketMessageType, MessageTypes } from '../../contexts/WebSocketContextBridge';

/**
 * A simple floating panel that displays real-time transcription
 * This is a lightweight alternative to the more complex EnhancedMiniTab
 */
const FloatingTranscriptionPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [transcriptions, setTranscriptions] = useState<any[]>([]);
  const { currentSession } = useSession();
  const { recordingStatus } = useAudio();
  const { lastMessage, addMessageHandler } = useWebSocketBridge();
  const panelRef = useRef<HTMLDivElement>(null);
  
  // Automatically show the panel when recording starts
  useEffect(() => {
    if (recordingStatus?.isRecording) {
      setIsVisible(true);
      // Clear transcriptions when starting a new recording
      if (transcriptions.length === 0 && !currentSession?.currentTranscriptions?.length) {
        setTranscriptions([]);
      } else if (currentSession?.currentTranscriptions?.length) {
        // Use existing transcriptions if available
        setTranscriptions(currentSession.currentTranscriptions);
      }
    } else {
      setIsVisible(false);
    }
  }, [recordingStatus, currentSession?.currentTranscriptions, transcriptions.length]);
  
  // Handle WebSocket messages for transcription updates
  useEffect(() => {
    if (!lastMessage) return;
    
    // Process transcription updates
    if (lastMessage.type === 'transcription_update' && lastMessage.data) {
      console.log('Received transcription update:', lastMessage.data);
      const newTranscription = {
        id: lastMessage.data.id || `transcription-${Date.now()}`,
        text: lastMessage.data.text || '',
        timestamp: lastMessage.data.timestamp || Math.floor(Date.now() / 1000),
        speaker: lastMessage.data.speaker_id || lastMessage.data.speaker || null,
        speaker_name: lastMessage.data.speaker_name || null,
        confidence: lastMessage.data.confidence || 1.0
      };
      
      setTranscriptions(prev => [...prev, newTranscription]);
    }
  }, [lastMessage]);
  
  // Register direct message handler for transcription updates
  useEffect(() => {
    // Add direct message handler
    const removeHandler = addMessageHandler(MessageTypes.TRANSCRIPTION_UPDATE, (data) => {
      console.log('Direct transcription handler received data:', data);
      if (!data) return;
      
      const newTranscription = {
        id: data.id || `transcription-${Date.now()}`,
        text: data.text || '',
        timestamp: data.timestamp || Math.floor(Date.now() / 1000),
        speaker: data.speaker_id || data.speaker || null,
        speaker_name: data.speaker_name || null,
        confidence: data.confidence || 1.0
      };
      
      setTranscriptions(prev => [...prev, newTranscription]);
    });
    
    return () => {
      removeHandler();
    };
  }, [addMessageHandler]);
  
  // Handle drag functionality
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });  // Bottom right position
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
  
  if (!isVisible) return null;
  
  // Determine if we have transcriptions - use local state
  const hasTranscriptions = transcriptions && transcriptions.length > 0;
  
  return (
    <div 
      ref={panelRef}
      style={{ 
        transform: `translate(${position.x}px, ${position.y}px)` 
      }}
      className="fixed bottom-4 right-4 z-[9999] w-80 shadow-lg rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* Header - Draggable */}
      <div 
        className="bg-primary-600 text-white p-2 flex justify-between items-center cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center">
          <MicrophoneIcon className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">Live Transcription</span>
        </div>
        
        <div className="flex space-x-1">
          <button 
            onClick={handleToggleMinimize}
            className="p-1 hover:bg-primary-500 rounded"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? "+" : "-"}
          </button>
          
          <button 
            onClick={handleClose}
            className="p-1 hover:bg-primary-500 rounded"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      
      {/* Content */}
      {!isMinimized && (
        <div className="p-3 max-h-60 overflow-y-auto bg-white dark:bg-gray-800">
          {!hasTranscriptions ? (
            <div className="flex flex-col items-center justify-center py-4 text-gray-500">
              <MicrophoneIcon className="h-8 w-8 mb-2 animate-pulse text-primary-500" />
              <p className="text-sm">Waiting for transcription...</p>
              <p className="text-xs mt-1">Start speaking to generate transcriptions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transcriptions.map((transcription: any, index: number) => (
                <div key={transcription.id || index} className="text-sm">
                  <div className="flex items-center text-xs text-gray-500 mb-1">
                    <span className="font-mono">
                      {new Date(transcription.timestamp * 1000).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                    {transcription.speaker && (
                      <span className="ml-2 bg-primary-100 text-primary-800 px-1.5 py-0.5 rounded-full text-xs">
                        {transcription.speaker}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-800 dark:text-gray-200">{transcription.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingTranscriptionPanel;
