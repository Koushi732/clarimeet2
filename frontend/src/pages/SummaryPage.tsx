import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSession } from '../contexts/SessionContext';
import { Summary } from '../types';

// Icons
import {
  DocumentTextIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  BookmarkIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

const SummaryPage = (): React.ReactElement => {
  const { currentSession, isLoading, error, generateSummary } = useSession();
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryType, setSummaryType] = useState('overall');
  
  // Check if we have an active session
  const hasActiveSession = !!currentSession?.session;
  const hasSummaries = hasActiveSession && currentSession.currentSummaries.length > 0;
  
  // Generate summary
  const handleGenerateSummary = async () => {
    if (!hasActiveSession) return;
    
    setIsGenerating(true);
    
    try {
      await generateSummary(currentSession.session.id, summaryType);
    } catch (error) {
      console.error('Error generating summary:', error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Copy summary to clipboard
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Here you could add a toast notification
    alert('Summary copied to clipboard');
  };
  
  // Group summaries by type
  const groupedSummaries = React.useMemo(() => {
    if (!hasActiveSession || !currentSession.currentSummaries.length) {
      return {};
    }
    
    return currentSession.currentSummaries.reduce<Record<string, Summary[]>>((acc, summary) => {
      if (!acc[summary.summaryType]) {
        acc[summary.summaryType] = [];
      }
      
      acc[summary.summaryType].push(summary);
      return acc;
    }, {}) as Record<string, Summary[]>;
  }, [hasActiveSession, currentSession?.currentSummaries]);
  
  // Format time
  const formatTime = (timestamp: number): string => {
    if (!timestamp) return '--:--';
    
    const minutes = Math.floor(timestamp / 60);
    const seconds = Math.floor(timestamp % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Meeting Summary
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          View and generate AI-powered summaries of your meetings
        </p>
      </motion.div>
      
      {!hasActiveSession ? (
        <div className="card p-12 text-center">
          <DocumentTextIcon className="h-16 w-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Active Session</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Start a recording or upload an audio file to generate summaries
          </p>
          <div className="flex justify-center space-x-4">
            <a href="/live" className="btn btn-primary">
              Start Recording
            </a>
            <a href="/upload" className="btn btn-outline">
              Upload Audio
            </a>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main summary area */}
          <div className="md:col-span-2">
            <div className="card p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  {currentSession.session.title || 'Untitled Session'}
                </h2>
                <div className="flex space-x-2">
                  <select
                    className="input py-1 px-2 text-sm"
                    value={summaryType}
                    onChange={(e) => setSummaryType(e.target.value)}
                    disabled={isGenerating}
                  >
                    <option value="overall">Overall Summary</option>
                    <option value="key_points">Key Points</option>
                    <option value="action_items">Action Items</option>
                    <option value="decisions">Decisions</option>
                  </select>
                  
                  <button
                    onClick={handleGenerateSummary}
                    disabled={isGenerating || isLoading}
                    className="btn btn-primary py-1 px-3 text-sm"
                  >
                    {isGenerating ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      'Generate'
                    )}
                  </button>
                </div>
              </div>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-md mb-4">
                  {error}
                </div>
              )}
              
              {hasSummaries ? (
                <div>
                  {Object.entries(groupedSummaries).map(([type, summaries]) => {
                    // Get the most recent summary of this type
                    const typedSummaries = summaries as Summary[];
                    const latestSummary = typedSummaries[typedSummaries.length - 1];
                    
                    return (
                      <div key={type} className="mb-8 last:mb-0">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-medium text-lg capitalize">
                            {type.replace('_', ' ')} Summary
                          </h3>
                          <div className="flex space-x-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Generated at {formatDate(latestSummary.createdAt)}
                            </span>
                            <button
                              onClick={() => handleCopyToClipboard(latestSummary.text)}
                              className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
                              title="Copy to clipboard"
                            >
                              <DocumentDuplicateIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 dark:bg-dark-600 p-4 rounded-lg">
                          <p className="whitespace-pre-line">{latestSummary.text}</p>
                        </div>
                        
                        {latestSummary.segmentStart !== null && latestSummary.segmentEnd !== null && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Time range: {formatTime(latestSummary.segmentStart || 0)} - {formatTime(latestSummary.segmentEnd || 0)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <DocumentTextIcon className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Summaries Yet</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Generate your first summary using the button above
                  </p>
                </div>
              )}
            </div>
            
            {/* Historical summaries if available */}
            {hasSummaries && Object.keys(groupedSummaries).length > 0 && (
              <div className="card p-6">
                <h2 className="text-xl font-semibold mb-4">Summary History</h2>
                
                <div className="space-y-4">
                  {Object.entries(groupedSummaries).map(([type, summaries]) => {
                    const typedSummaries = summaries as Summary[];
                    if (typedSummaries.length <= 1) return null;
                    
                    // Skip the latest one as it's shown above
                    const historicalSummaries = [...typedSummaries].slice(0, -1).reverse();
                    
                    return (
                      <div key={`history-${type}`}>
                        <h3 className="font-medium capitalize text-gray-700 dark:text-gray-300 mb-2">
                          {type.replace('_', ' ')} Summaries
                        </h3>
                        
                        <div className="space-y-3">
                          {historicalSummaries.map((summary) => (
                            <div 
                              key={summary.id}
                              className="bg-gray-50 dark:bg-dark-700 p-3 rounded-md"
                            >
                              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <span>{formatDate(summary.createdAt)}</span>
                                <button
                                  onClick={() => handleCopyToClipboard(summary.text)}
                                  className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
                                  title="Copy to clipboard"
                                >
                                  <DocumentDuplicateIcon className="h-4 w-4" />
                                </button>
                              </div>
                              <p className="text-sm line-clamp-3">{summary.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          {/* Sidebar */}
          <div>
            <div className="card p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Session Info</h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Title</p>
                  <p className="font-medium">{currentSession.session.title || 'Untitled Session'}</p>
                </div>
                
                {currentSession.session.description && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Description</p>
                    <p>{currentSession.session.description}</p>
                  </div>
                )}
                
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
                  <p>{formatDate(currentSession.session.createdAt)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Duration</p>
                  <p>{formatTime(currentSession.session.duration)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Type</p>
                  <p>{currentSession.session.isLive ? 'Live Recording' : 'Uploaded Audio'}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                  <div className="flex items-center mt-1">
                    {currentSession.transcriptionStatus?.status === 'completed' ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500 mr-1" />
                    ) : (
                      <ClockIcon className="h-5 w-5 text-yellow-500 mr-1" />
                    )}
                    <span>
                      Transcription: {currentSession.transcriptionStatus?.status || 'Not Started'}
                    </span>
                  </div>
                  
                  <div className="flex items-center mt-1">
                    {currentSession.summarizationStatus?.status === 'completed' ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500 mr-1" />
                    ) : (
                      <ClockIcon className="h-5 w-5 text-yellow-500 mr-1" />
                    )}
                    <span>
                      Summarization: {currentSession.summarizationStatus?.status || 'Not Started'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="card p-6">
              <h2 className="text-xl font-semibold mb-4">Summary Types</h2>
              
              <ul className="space-y-4">
                <li className="flex items-start">
                  <BookmarkIcon className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium">Overall Summary</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Complete summary of the entire meeting
                    </p>
                  </div>
                </li>
                
                <li className="flex items-start">
                  <BookmarkIcon className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium">Key Points</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Important topics and main discussion points
                    </p>
                  </div>
                </li>
                
                <li className="flex items-start">
                  <BookmarkIcon className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium">Action Items</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Tasks, assignments, and follow-up items
                    </p>
                  </div>
                </li>
                
                <li className="flex items-start">
                  <BookmarkIcon className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium">Decisions</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Conclusions and decisions made during the meeting
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryPage;
