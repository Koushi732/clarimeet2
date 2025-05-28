import React, { useState, useEffect, useRef } from 'react';
import { ChatBubbleLeftRightIcon, XMarkIcon, PaperAirplaneIcon, UserIcon } from '@heroicons/react/24/solid';
import { useSession } from '../../contexts/SessionContext';
import { useAudio } from '../../contexts/AudioContext';
import { useWebSocketBridge } from '../../contexts/WebSocketContextBridge';
import axios from 'axios';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/**
 * A floating panel that provides AI chatbot functionality for answering questions about the meeting
 * Completes the audio pipeline with Q&A capabilities
 */
const FloatingChatbotPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { currentSession } = useSession();
  const { recordingStatus } = useAudio();
  const { addMessageHandler, sendMessage } = useWebSocketBridge();
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Automatically show the panel when recording starts
  useEffect(() => {
    if (recordingStatus?.isRecording) {
      setIsVisible(true);
      
      // Add initial message
      if (messages.length === 0) {
        setMessages([
          {
            id: 'welcome',
            role: 'system',
            content: 'Welcome to Clarimeet AI Assistant! Ask me questions about your meeting as it progresses.',
            timestamp: Date.now() / 1000
          }
        ]);
      }
    } else {
      setIsVisible(false);
    }
  }, [recordingStatus, messages.length]);
  
  // Scroll to bottom when new messages come in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Handle drag functionality
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 200 }); // Initial y-offset to separate from other panels
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
  
  // Register handler for chat responses from WebSocket
  useEffect(() => {
    const removeHandler = addMessageHandler('chat_response', (data) => {
      console.log('Received chat response:', data);
      if (!data || !data.message) return;
      
      // Add assistant response
      setMessages(prevMessages => [
        ...prevMessages, 
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message,
          timestamp: Date.now() / 1000
        }
      ]);
      
      setIsLoading(false);
    });
    
    return () => removeHandler();
  }, [addMessageHandler]);
  
  // Send message to AI via WebSocket for more reliable delivery
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentSession?.session?.id) return;
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: Date.now() / 1000
    };
    
    // Add user message to chat
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    try {
      // Option 1: Send via WebSocket for more reliable delivery
      const success = sendMessage({
        type: 'chat_request',
        session_id: currentSession.session.id,
        message: userMessage.content,
        history: messages
          .filter(msg => msg.role !== 'system')
          .slice(-10) // Limit context to last 10 messages
          .map(msg => ({
            role: msg.role,
            content: msg.content
          }))
      });
      
      if (!success) {
        // Fallback to HTTP if WebSocket fails
        try {
          const response = await axios.post(`/api/chat/${currentSession.session.id}`, {
            message: userMessage.content,
            history: messages
              .filter(msg => msg.role !== 'system')
              .slice(-10)
              .map(msg => ({
                role: msg.role,
                content: msg.content
              }))
          });
          
          // Add assistant response from HTTP
          setMessages(prevMessages => [
            ...prevMessages, 
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: response.data.message || "I'm processing the meeting transcription. Please ask me again in a moment.",
              timestamp: Date.now() / 1000
            }
          ]);
          setIsLoading(false);
        } catch (httpError) {
          throw httpError; // Let the outer catch handle it
        }
      }
      // If WebSocket succeeds, the message handler will add the response
    } catch (error) {
      console.error('Error sending message to AI:', error);
      
      // Add error message
      setMessages(prevMessages => [
        ...prevMessages, 
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: "Sorry, I couldn't process your request. Please try again.",
          timestamp: Date.now() / 1000
        }
      ]);
      setIsLoading(false);
    }
  };
  
  // Handle input keypress (send on Enter)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Handle suggestions
  const handleSuggestion = (suggestion: string) => {
    setInputValue(suggestion);
    setTimeout(() => handleSendMessage(), 100);
  };
  
  if (!isVisible) return null;
  
  // Default suggestions based on meeting context
  const suggestions = [
    "Summarize the key points so far",
    "What decisions have been made?",
    "Who are the main speakers?",
    "What action items were mentioned?"
  ];
  
  // Position panel on the left side to not overlap with other panels
  const panelStyle = {
    transform: `translate(${position.x}px, ${position.y}px)`,
    left: '20px'  // Position on the left side
  };
  
  return (
    <div 
      ref={panelRef}
      style={panelStyle}
      className="fixed bottom-4 left-4 z-[9999] w-80 shadow-lg rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* Header - Draggable */}
      <div 
        className="bg-indigo-600 text-white p-2 flex justify-between items-center cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center">
          <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">AI Meeting Assistant</span>
        </div>
        
        <div className="flex space-x-1">
          <button 
            onClick={handleToggleMinimize}
            className="p-1 hover:bg-indigo-500 rounded"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? "+" : "-"}
          </button>
          
          <button 
            onClick={handleClose}
            className="p-1 hover:bg-indigo-500 rounded"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      
      {/* Content */}
      {!isMinimized && (
        <>
          {/* Chat messages */}
          <div className="p-3 h-60 overflow-y-auto bg-gray-50 dark:bg-gray-900">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`mb-3 ${
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
                        ? 'bg-indigo-500 text-white' 
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700'
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
            
            {isLoading && (
              <div className="flex justify-start mb-3">
                <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                  <div className="flex space-x-1">
                    <div className="h-2 w-2 bg-indigo-500 rounded-full animate-bounce"></div>
                    <div className="h-2 w-2 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
                    <div className="h-2 w-2 bg-indigo-500 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Suggestions */}
          {messages.length < 3 && (
            <div className="p-2 bg-indigo-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 mb-1">Try asking:</p>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestion(suggestion)}
                    className="text-xs bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-full px-2 py-1 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Input area */}
          <div className="p-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your meeting..."
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-l-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                className={`bg-indigo-500 text-white rounded-r-lg px-3 py-2 ${
                  !inputValue.trim() || isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-600'
                }`}
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FloatingChatbotPanel;
