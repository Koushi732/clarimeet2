import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../contexts/SessionContext';

// Icons
import {
  FolderIcon,
  MicrophoneIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  TrashIcon,
  PencilIcon,
  ClockIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

const SessionsPage = (): React.ReactElement => {
  const { sessions, fetchSessions, deleteSession, isLoading, error } = useSession();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  
  // Load sessions on component mount
  useEffect(() => {
    fetchSessions();
  }, []);
  
  // Filter sessions based on search term
  const filteredSessions = searchTerm
    ? sessions.filter(
        session =>
          session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (session.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
      )
    : sessions;
  
  // Delete session handler
  const handleDeleteSession = async (sessionId: string) => {
    if (confirmDelete !== sessionId) {
      setConfirmDelete(sessionId);
      setTimeout(() => setConfirmDelete(null), 3000); // Reset after 3 seconds
      return;
    }
    
    setIsDeleting(sessionId);
    setConfirmDelete(null);
    
    try {
      const success = await deleteSession(sessionId);
      
      if (success) {
        console.log(`Session ${sessionId} deleted successfully`);
      }
    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
    } finally {
      setIsDeleting(null);
    }
  };
  
  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };
  
  // Format duration
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="flex justify-between items-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Sessions
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Manage your recorded and uploaded sessions
          </p>
        </div>
        
        <div className="flex space-x-3">
          <Link to="/upload" className="btn btn-outline">
            <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
            Upload
          </Link>
          
          <Link to="/live" className="btn btn-primary">
            <MicrophoneIcon className="h-5 w-5 mr-2" />
            Record
          </Link>
        </div>
      </motion.div>
      
      {/* Search and filters */}
      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="input pl-10"
            placeholder="Search by title or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {/* Sessions list */}
      <div className="bg-white dark:bg-dark-700 rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <ArrowPathIcon className="h-8 w-8 mx-auto text-gray-400 dark:text-gray-500 animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-300">Loading sessions...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <ExclamationCircleIcon className="h-8 w-8 mx-auto text-red-500 mb-4" />
            <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>
            <button
              onClick={() => fetchSessions()}
              className="btn btn-outline py-1 px-3 text-sm"
            >
              Retry
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-8 text-center">
            {searchTerm ? (
              <>
                <MagnifyingGlassIcon className="h-8 w-8 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  No sessions matching "{searchTerm}"
                </p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="btn btn-outline py-1 px-3 text-sm"
                >
                  Clear Search
                </button>
              </>
            ) : (
              <>
                <FolderIcon className="h-8 w-8 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  No sessions yet. Start by recording or uploading audio.
                </p>
                <div className="flex justify-center space-x-3">
                  <Link to="/upload" className="btn btn-outline">
                    Upload Audio
                  </Link>
                  <Link to="/live" className="btn btn-primary">
                    Start Recording
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-600">
              <thead className="bg-gray-50 dark:bg-dark-600">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Session
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Created
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Duration
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-700 divide-y divide-gray-200 dark:divide-dark-600">
                {filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-dark-600">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/sessions/${session.id}`}
                        className="flex items-start"
                      >
                        <DocumentTextIcon className="h-5 w-5 text-primary-500 mr-3 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {session.title || 'Untitled Session'}
                          </div>
                          {session.description && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                              {session.description}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {session.isLive ? (
                          <>
                            <MicrophoneIcon className="h-4 w-4 text-blue-500 mr-1" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              Live Recording
                            </span>
                          </>
                        ) : (
                          <>
                            <ArrowUpTrayIcon className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              Uploaded Audio
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                        <ClockIcon className="h-4 w-4 text-gray-400 mr-1" />
                        {formatDate(session.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      {formatDuration(session.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/sessions/${session.id}`}
                          className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          className={`flex items-center ${
                            confirmDelete === session.id
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                          }`}
                          disabled={isDeleting === session.id}
                        >
                          {isDeleting === session.id ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <TrashIcon className="h-4 w-4" />
                          )}
                          {confirmDelete === session.id && (
                            <span className="ml-1">Confirm</span>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionsPage;
