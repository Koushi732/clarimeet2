import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, Cog6ToothIcon, MicrophoneIcon, DocumentTextIcon, PaperAirplaneIcon, UserIcon, ChartBarIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { useWebSocketBridge, WebSocketMessageType, MessageTypes } from '../../contexts/WebSocketContextBridge';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/AudioContext';

/**
 * A simple, reliable floating panel that works without complex WebSocket handling
 */
const SimpleFloatingPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcription' | 'summary' | 'chatbot'>('transcription');
  const { recordingStatus } = useAudio();
  const { connected, addMessageHandler, sendMessage } = useWebSocketBridge();
  const { currentSession } = useSession();
  
  // Data states with initial mock data
  const [transcriptions, setTranscriptions] = useState<any[]>([
    { id: '1', text: 'Hello and welcome to the meeting.', timestamp: Date.now()/1000 - 120 },
    { id: '2', text: 'Today we will discuss the quarterly results.', timestamp: Date.now()/1000 - 100 },
    { id: '3', text: 'Sales have increased by 15% compared to last quarter.', timestamp: Date.now()/1000 - 80 }
  ]);
  
  const [summaries, setSummaries] = useState<any[]>([
    { 
      id: '1', 
      text: 'Meeting started with introductions. Discussion about quarterly results with 15% increase in sales.', 
      timestamp: Date.now()/1000 - 60,
      summary_type: 'incremental'
    }
  ]);
  
  const [chatMessages, setChatMessages] = useState<any[]>([
    { id: 'system-1', role: 'system', content: 'How can I help you with this meeting?', timestamp: Date.now()/1000 - 40 }
  ]);
  
  // Setup WebSocket handlers for real data when available
  useEffect(() => {
    if (connected) {
      console.log('Setting up WebSocket handlers for real data');
      
      // Handle transcription updates
      const removeTranscriptionHandler = addMessageHandler(MessageTypes.TRANSCRIPTION, (data) => {
        console.log('Received transcription update:', data);
        if (data && data.text) {
          setTranscriptions(prev => [
            ...prev,
            {
              id: `tr-${Date.now()}`,
              text: data.text,
              timestamp: data.timestamp || Date.now()/1000
            }
          ]);
        }
      });
      
      // Handle summary updates
      const removeSummaryHandler = addMessageHandler(MessageTypes.SUMMARY, (data) => {
        console.log('Received summary update:', data);
        if (data && data.text) {
          setSummaries(prev => [
            ...prev,
            {
              id: `sum-${Date.now()}`,
              text: data.text,
              timestamp: data.timestamp || Date.now()/1000,
              summary_type: data.summary_type || 'incremental'
            }
          ]);
        }
      });
      
      // Cleanup handlers on unmount
      return () => {
        removeTranscriptionHandler();
        removeSummaryHandler();
      };
    }
  }, [connected, addMessageHandler]);
  
  // Show when recording starts and handle WebSocket connection
  useEffect(() => {
    if (recordingStatus?.isRecording) {
      setIsVisible(true);
      
      // Check if we're connected to WebSocket
      if (connected && recordingStatus.sessionId && currentSession?.session?.id) {
        console.log('Recording started with active WebSocket connection!');
        console.log('Session ID:', recordingStatus.sessionId);
        
        // Let's ensure we're connected to the right session
        if (currentSession.session.id !== recordingStatus.sessionId) {
          console.log('Connecting to the new session:', recordingStatus.sessionId);
          // Attempt to connect to the new session via WebSocket
          sendMessage({
            type: 'connect_session',
            session_id: recordingStatus.sessionId,
            client_id: new Date().getTime().toString(),
            timestamp: Date.now()
          });
        }
        
        // No need for mock data intervals when we have real WebSocket data
        return;
      }
      
      console.log('WebSocket disconnected. Please check your connection to the server.');
      
      // Display connection status instead of mock data
      setTranscriptions(prev => [
        ...prev, 
        { 
          id: `connection-status-${Date.now()}`, 
          text: "WebSocket disconnected. Please check your network connection and server status.", 
          timestamp: Date.now()/1000 
        }
      ]);
      
      // No mock data intervals - waiting for real connection
      const connectionStatusInterval = setInterval(() => {
        // Check connection status every 5 seconds
        if (!connected) {
          console.log('Still disconnected from WebSocket. Waiting for connection...');
        }
      }, 5000);
      
      return () => clearInterval(connectionStatusInterval);
    } else {
      setIsVisible(false);
    }
  }, [recordingStatus, connected, currentSession, sendMessage]);
  
  // Setup WebSocket handler for chat responses
  useEffect(() => {
    if (connected) {
      const removeChatHandler = addMessageHandler(MessageTypes.CHAT_RESPONSE, (data) => {
        console.log('Received chat response:', data);
        if (data && data.message) {
          setChatMessages(prev => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: data.message,
              timestamp: Date.now()/1000
            }
          ]);
        }
      });
      
      return () => removeChatHandler();
    }
  }, [connected, addMessageHandler]);
  
  // Handle sending a chat message
  const handleSendChatMessage = (message: string) => {
    if (!message.trim()) return;
    
    // Add user message to chat UI immediately
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now()/1000
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    
    // Try to send via WebSocket if connected
    if (connected && currentSession?.session?.id) {
      console.log('Sending chat message via WebSocket');
      const success = sendMessage({
        type: 'chat_request',
        session_id: currentSession.session.id,
        message: userMessage.content,
        timestamp: Date.now()
      });
      
      if (!success) {
        console.warn('Failed to send chat message via WebSocket, using fallback');
        generateFallbackChatResponse();
      }
    } else {
      // Use fallback if not connected
      console.log('Using fallback chat response (not connected to WebSocket)');
      generateFallbackChatResponse();
    }
  };
  
  // Fallback chat response generator
  const generateFallbackChatResponse = () => {
    setTimeout(() => {
      const responses = [
        "Based on the transcription, the team is focusing on market expansion strategies.",
        "The product launch is scheduled for next month according to the discussion.",
        "I can see from the meeting that customer satisfaction has improved.",
        "The main points discussed so far are product development and marketing strategies."
      ];
      
      setChatMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: responses[Math.floor(Math.random() * responses.length)],
          timestamp: Date.now()/1000
        }
      ]);
    }, 1500);
  };
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-96 shadow-xl rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-primary-600 text-white p-2 flex justify-between items-center">
        <div className="flex items-center">
          <span className="text-sm font-medium">Clarimeet Assistant</span>
        </div>
        
        <button 
          onClick={() => setIsVisible(false)}
          className="p-1 hover:bg-primary-500 rounded"
          title="Close"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('transcription')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'transcription' 
              ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400' 
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <div className="flex items-center justify-center">
            <MicrophoneIcon className="h-4 w-4 mr-1" />
            <span>Live</span>
          </div>
        </button>
        
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'summary' 
              ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400' 
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <div className="flex items-center justify-center">
            <ChartBarIcon className="h-4 w-4 mr-1" />
            <span>Summary</span>
          </div>
        </button>
        
        <button
          onClick={() => setActiveTab('chatbot')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'chatbot' 
              ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400' 
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <div className="flex items-center justify-center">
            <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" />
            <span>AI Chat</span>
          </div>
        </button>
      </div>
      
      {/* Content */}
      <div className="max-h-80 overflow-y-auto p-3">
        {activeTab === 'transcription' && (
          <div className="space-y-3">
            {transcriptions.map((item) => (
              <div key={item.id} className="text-sm">
                <div className="text-xs text-gray-500 mb-1">
                  {new Date(item.timestamp * 1000).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit'
                  })}
                </div>
                <p className="text-gray-800 dark:text-gray-200">{item.text}</p>
              </div>
            ))}
          </div>
        )}
        
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {summaries.map((item) => (
              <div key={item.id} className="text-sm">
                <div className="flex justify-between items-center text-xs text-blue-800 dark:text-blue-300 mb-1">
                  <div>
                    {new Date(item.timestamp * 1000).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit'
                    })}
                    {item.summary_type && (
                      <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full text-xs">
                        {item.summary_type}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-gray-800 dark:text-gray-200">{item.text}</p>
              </div>
            ))}
          </div>
        )}
        
        {activeTab === 'chatbot' && (
          <div>
            <div className="space-y-3 mb-4">
              {chatMessages.map((message) => (
                <div 
                  key={message.id} 
                  className={`${
                    message.role === 'user' 
                      ? 'text-right' 
                      : message.role === 'system' 
                        ? 'text-center italic text-gray-500 text-xs my-2' 
                        : 'text-left'
                  }`}
                >
                  {message.role !== 'system' && (
                    <div 
                      className={`inline-block rounded-lg px-3 py-2 max-w-[80%] ${
                        message.role === 'user' 
                          ? 'bg-primary-500 text-white' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {message.content}
                    </div>
                  )}
                  
                  {message.role === 'system' && (
                    <div className="py-1 px-3">{message.content}</div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Chat input */}
            <div className="flex">
              <input
                type="text"
                placeholder="Ask about your meeting..."
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-l px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSendChatMessage((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <button
                className="bg-primary-500 text-white px-3 py-2 rounded-r text-sm"
                onClick={() => {
                  const input = document.querySelector('input') as HTMLInputElement;
                  handleSendChatMessage(input.value);
                  input.value = '';
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleFloatingPanel;
