import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../contexts/SessionContext';
import SessionExport from '../components/SessionExport';

// Icons
import {
  DocumentTextIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  PlayIcon,
  TrashIcon,
  PencilIcon,
  MicrophoneIcon,
  ArrowUpTrayIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

const SessionDetailPage = (): React.ReactElement => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const { 
    getSessionById, 
    deleteSession, 
    exportSession, 
    isLoading, 
    error 
  } = useSession();
  
  const [session, setSession] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcription' | 'summary'>('transcription');
  
  // Define loadSession with useCallback to properly handle dependencies
  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      const sessionData = await getSessionById(sessionId);
      
      if (sessionData) {
        setSession(sessionData);
        setTitle(sessionData.title || '');
        setDescription(sessionData.description || '');
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  }, [sessionId, getSessionById]);
  
  // Load session on component mount
  useEffect(() => {
    if (sessionId) {
      loadSession();
    }
  }, [sessionId, loadSession]);
  
  // Handle delete session
  const handleDeleteSession = async () => {
    if (!sessionId) return;
    
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000); // Reset after 3 seconds
      return;
    }
    
    setIsDeleting(true);
    
    try {
      const success = await deleteSession(sessionId);
      
      if (success) {
        navigate('/sessions');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };
  
  // Handle export session
  const handleExportSession = async (format: string = 'json') => {
    if (!sessionId) return;
    
    try {
      await exportSession(sessionId, format);
    } catch (error) {
      console.error('Error exporting session:', error);
    }
  };
  
  // Format time
  const formatTime = (seconds: number): string => {
    if (!seconds) return '00:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Format date
  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
  };
  
  // Render loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <ArrowPathIcon className="h-12 w-12 mx-auto text-primary-500 animate-spin mb-4" />
          <h2 className="text-xl font-semibold">Loading session...</h2>
        </div>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
          <button
            onClick={() => loadSession()}
            className="btn btn-outline py-1 px-3 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  // Render not found state
  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <DocumentTextIcon className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
          <h2 className="text-xl font-semibold mb-4">Session Not Found</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            The session you're looking for doesn't exist or has been deleted.
          </p>
          <button
            onClick={() => navigate('/sessions')}
            className="btn btn-primary"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Back button and actions */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => navigate('/sessions')}
            className="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <ChevronLeftIcon className="h-5 w-5 mr-1" />
            Back to Sessions
          </button>
          
          <div className="flex space-x-2">
            <div className="relative">
              {/* Replace with SessionExport component */}
              {session && <SessionExport session={session} className="inline-flex" />}
            </div>
            
            <button
              onClick={handleDeleteSession}
              className={`btn py-1 px-3 text-sm ${
                confirmDelete
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'btn-outline text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
              }`}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <TrashIcon className="h-4 w-4 mr-1" />
                  {confirmDelete ? 'Confirm Delete' : 'Delete'}
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Session title and info */}
        <div className="bg-white dark:bg-dark-700 rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            {isEditing ? (
              <div className="w-full space-y-3">
                <input
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Session title"
                />
                <textarea
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                />
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="btn btn-outline py-1 px-3 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      // TODO: Update session title and description
                      setIsEditing(false);
                    }}
                    className="btn btn-primary py-1 px-3 text-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {session.title || 'Untitled Session'}
                </h1>
                {session.description && (
                  <p className="text-gray-600 dark:text-gray-300 mt-1">
                    {session.description}
                  </p>
                )}
                <div className="flex items-center mt-3 space-x-4 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center">
                    {session.isLive ? (
                      <MicrophoneIcon className="h-4 w-4 mr-1 text-blue-500" />
                    ) : (
                      <ArrowUpTrayIcon className="h-4 w-4 mr-1 text-green-500" />
                    )}
                    <span>
                      {session.isLive ? 'Live Recording' : 'Uploaded Audio'}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <DocumentTextIcon className="h-4 w-4 mr-1" />
                    <span>{session.transcriptions?.length || 0} Transcriptions</span>
                  </div>
                  <div className="flex items-center">
                    <InformationCircleIcon className="h-4 w-4 mr-1" />
                    <span>Created: {formatDate(session.createdAt)}</span>
                  </div>
                  <div className="flex items-center">
                    <span>Duration: {formatTime(session.duration)}</span>
                  </div>
                </div>
              </div>
            )}
            
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          
          {/* Audio player (placeholder - would need actual audio player implementation) */}
          {session.audioPath && (
            <div className="bg-gray-100 dark:bg-dark-600 rounded-lg p-4 flex items-center">
              <button className="p-2 bg-primary-500 text-white rounded-full mr-4">
                <PlayIcon className="h-6 w-6" />
              </button>
              
              <div className="flex-1">
                <div className="w-full bg-gray-300 dark:bg-dark-500 rounded-full h-2">
                  <div className="bg-primary-500 h-2 rounded-full w-0" />
                </div>
                <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>00:00</span>
                  <span>{formatTime(session.duration)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-dark-600 mb-6">
        <button
          className={`py-2 px-4 font-medium text-sm border-b-2 ${
            activeTab === 'transcription'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('transcription')}
        >
          Transcription
        </button>
        <button
          className={`py-2 px-4 font-medium text-sm border-b-2 ${
            activeTab === 'summary'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
      </div>
      
      {/* Tab content */}
      <div className="bg-white dark:bg-dark-700 rounded-lg shadow-md overflow-hidden">
        {activeTab === 'transcription' ? (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Transcription</h2>
              <button
                onClick={() => {
                  // Copy transcription to clipboard
                  const text = session.transcriptions
                    .map((t: any) => `[${formatTime(t.timestamp)}] ${t.text}`)
                    .join('\n\n');
                  navigator.clipboard.writeText(text);
                  alert('Transcription copied to clipboard');
                }}
                className="btn btn-outline py-1 px-3 text-sm"
              >
                <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                Copy All
              </button>
            </div>
            
            {session.transcriptions && session.transcriptions.length > 0 ? (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {session.transcriptions.map((transcription: any) => (
                  <div key={transcription.id} className="pb-4 border-b border-gray-100 dark:border-dark-600 last:border-0">
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-1">
                      <span className="font-mono">{formatTime(transcription.timestamp)}</span>
                      {transcription.speaker && (
                        <span className="ml-2 bg-gray-100 dark:bg-dark-600 px-2 py-0.5 rounded-full text-xs">
                          {transcription.speaker}
                        </span>
                      )}
                      {transcription.confidence && (
                        <span className="ml-2 text-xs">
                          Confidence: {(transcription.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className="text-gray-800 dark:text-gray-200">{transcription.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <DocumentTextIcon className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                <p className="text-gray-600 dark:text-gray-300">
                  No transcriptions available for this session.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Summary</h2>
              <button
                onClick={() => {
                  // Copy summary to clipboard
                  if (session.summaries && session.summaries.length > 0) {
                    const text = session.summaries
                      .map((s: any) => `${s.summaryType.toUpperCase()}\n\n${s.text}`)
                      .join('\n\n---\n\n');
                    navigator.clipboard.writeText(text);
                    alert('Summary copied to clipboard');
                  }
                }}
                className="btn btn-outline py-1 px-3 text-sm"
                disabled={!session.summaries || session.summaries.length === 0}
              >
                <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                Copy All
              </button>
            </div>
            
            {session.summaries && session.summaries.length > 0 ? (
              <div className="space-y-6 max-h-96 overflow-y-auto">
                {/* Group summaries by type and show the most recent one first */}
                {Object.entries(
                  session.summaries.reduce((acc: any, summary: any) => {
                    if (!acc[summary.summaryType]) {
                      acc[summary.summaryType] = [];
                    }
                    acc[summary.summaryType].push(summary);
                    return acc;
                  }, {})
                ).map(([type, summaries]: [string, any]) => {
                  // Sort by created date descending
                  const sortedSummaries = [...summaries].sort(
                    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  );
                  
                  return (
                    <div key={type} className="pb-6 border-b border-gray-200 dark:border-dark-600 last:border-0">
                      <h3 className="font-medium text-lg capitalize mb-3">
                        {type.replace('_', ' ')} Summary
                      </h3>
                      <div className="bg-gray-50 dark:bg-dark-600 p-4 rounded-lg">
                        <p className="whitespace-pre-line">{sortedSummaries[0].text}</p>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Generated at {formatDate(sortedSummaries[0].createdAt)}
                      </div>
                      
                      {/* Show previous versions if available */}
                      {sortedSummaries.length > 1 && (
                        <details className="mt-2">
                          <summary className="text-sm text-primary-600 dark:text-primary-400 cursor-pointer">
                            Show previous versions ({sortedSummaries.length - 1})
                          </summary>
                          <div className="mt-3 space-y-3">
                            {sortedSummaries.slice(1).map((summary: any) => (
                              <div
                                key={summary.id}
                                className="text-sm bg-gray-50 dark:bg-dark-700 p-3 rounded border border-gray-200 dark:border-dark-600"
                              >
                                <p className="whitespace-pre-line">{summary.text}</p>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                  Generated at {formatDate(summary.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <DocumentTextIcon className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                <p className="text-gray-600 dark:text-gray-300">
                  No summaries available for this session.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionDetailPage;
