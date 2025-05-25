import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

interface AIChatbotPanelProps {
  session: any; // Using any for now, should be properly typed with your session interface
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

const AIChatbotPanel: React.FC<AIChatbotPanelProps> = ({ session }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  
  // Generate a welcome message when the session changes
  useEffect(() => {
    if (session?.session?.id && messages.length === 0) {
      const welcomeMessage: Message = {
        id: `ai-${Date.now()}`,
        text: `Hello! I'm your AI assistant for this session${session.session.title ? ` "${session.session.title}"` : ''}. How can I help you today?`,
        sender: 'ai',
        timestamp: Date.now()
      };
      setMessages([welcomeMessage]);
    }
  }, [session?.session?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Function to handle sending a message
  const handleSendMessage = async () => {
    if (!inputText.trim() || !session?.session) return;
    
    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: inputText,
      sender: 'user',
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    
    // In a real implementation, you would send this to your backend API
    // and get a response from the AI. This is a simplified version.
    
    setTimeout(() => {
      // Generate context-aware response based on session data
      let responseText = 'I\'m processing your request...';
      
      if (session?.currentTranscriptions?.length > 0) {
        const recentTranscription = session.currentTranscriptions[session.currentTranscriptions.length - 1].text;
        responseText = `Based on the recent discussion about "${recentTranscription.substring(0, 30)}...", I think I can help with that. What specific information are you looking for?`;
      }
      
      if (session?.currentSummaries?.length > 0) {
        const recentSummary = session.currentSummaries[session.currentSummaries.length - 1].text;
        responseText = `According to the latest summary, ${recentSummary.substring(0, 100)}... Does this answer your question?`;
      }
      
      // Add AI response
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        text: responseText,
        sender: 'ai',
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1000);
  };

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!session?.session) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
        <ChatBubbleLeftRightIcon className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">No active session</p>
        <p className="text-xs mt-1">Start a session to chat with AI</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-primary-700 dark:text-primary-400">
          AI Chatbot
        </h3>
        <button 
          onClick={() => chatInputRef.current?.focus()}
          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-dark-700 dark:text-gray-300"
        >
          Ask a question
        </button>
      </div>

      <div className="flex-1 overflow-y-auto max-h-48 bg-gray-50 dark:bg-dark-700 rounded-md p-2 text-sm mb-2">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`mb-2 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}
          >
            <div
              className={`inline-block max-w-[85%] p-2 rounded-lg ${message.sender === 'user' 
                ? 'bg-primary-100 text-primary-900 dark:bg-primary-800 dark:text-primary-100 rounded-tr-none' 
                : 'bg-gray-200 text-gray-800 dark:bg-dark-600 dark:text-gray-100 rounded-tl-none'}`}
            >
              {message.text}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
          </motion.div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start mb-2">
            <div className="inline-block p-3 bg-gray-200 dark:bg-dark-600 rounded-lg rounded-tl-none">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="relative">
        <input
          ref={chatInputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the meeting..."
          className="w-full p-2 pr-10 border border-gray-300 dark:border-dark-500 rounded-md bg-white dark:bg-dark-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          disabled={isLoading}
        />
        <button
          onClick={handleSendMessage}
          disabled={!inputText.trim() || isLoading}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-primary-500 disabled:text-gray-300 dark:disabled:text-gray-600 transition-colors"
        >
          {isLoading ? (
            <ArrowPathIcon className="h-5 w-5 animate-spin" />
          ) : (
            <PaperAirplaneIcon className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
};

export default AIChatbotPanel;
