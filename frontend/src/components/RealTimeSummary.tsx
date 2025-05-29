import React, { useState, useEffect } from 'react';
import { useWebSocketBridge, WebSocketMessageType, MessageTypes } from '../contexts/WebSocketContextBridge';
import { useSession } from '../contexts/SessionContext';
import { Summary } from '../types';

interface RealTimeSummaryProps {
  sessionId?: string;
  interval?: number; // Interval in seconds
  compact?: boolean;
}

const RealTimeSummary: React.FC<RealTimeSummaryProps> = ({ 
  sessionId, 
  interval = 60,
  compact = false
}) => {
  const { sendMessage, addMessageHandler, connectionStatus, isConnectedToSession } = useWebSocketBridge();
  const { currentSession } = useSession();
  const [isActive, setIsActive] = useState(false);
  const [latestSummary, setLatestSummary] = useState<Summary | null>(null);
  const [summaryType, setSummaryType] = useState<string>('incremental');
  const [error, setError] = useState<string | null>(null);

  // Get session ID from props or current session
  const activeSessionId = sessionId || currentSession?.session?.id;

  // Start real-time summarization
  const startSummarization = async () => {
    if (!activeSessionId || !isConnectedToSession) {
      setError('No active session or WebSocket connection');
      return;
    }

    try {
      setError(null);
      
      // Request to start real-time summarization
      sendMessage({
        type: 'start_realtime_summarization',
        data: {
          session_id: activeSessionId,
          summary_type: summaryType,
          interval_seconds: interval
        }
      });
      
      setIsActive(true);
    } catch (error) {
      console.error('Failed to start real-time summarization:', error);
      setError('Failed to start summarization');
      setIsActive(false);
    }
  };

  // Stop real-time summarization
  const stopSummarization = () => {
    if (!activeSessionId) return;

    try {
      sendMessage({
        type: 'stop_realtime_summarization',
        data: {
          session_id: activeSessionId
        }
      });
      
      setIsActive(false);
    } catch (error) {
      console.error('Failed to stop real-time summarization:', error);
    }
  };

  // Handle WebSocket connection changes
  useEffect(() => {
    if (isConnectedToSession && isActive && activeSessionId) {
      // If connection restored and was active before, restart
      startSummarization();
    }
  }, [isConnectedToSession]);

  // Register handlers for summary updates
  useEffect(() => {
    if (!activeSessionId) return;

    // Add handler for summary updates
    const removeHandler = addMessageHandler(MessageTypes.SUMMARY_UPDATE, (data) => {
      console.log('Received summary update:', data);
      if (data && (data.sessionId === activeSessionId || data.session_id === activeSessionId)) {
        setLatestSummary(data);
      }
    });

    // Add handler for summarization status updates
    const removeStatusHandler = addMessageHandler(MessageTypes.SUMMARIZATION_STATUS_UPDATE, (data) => {
      console.log('Received summarization status update:', data);
      if (data && (data.sessionId === activeSessionId || data.session_id === activeSessionId)) {
        setIsActive(data.status === 'started' || data.status === 'generating');
      }
    });

    return () => {
      // Clean up event handlers
      removeHandler();
      removeStatusHandler();
    };
  }, [activeSessionId, addMessageHandler]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isActive && activeSessionId) {
        stopSummarization();
      }
    };
  }, []);

  // Format timestamp to readable time
  const formatTime = (timestamp: string | number | Date): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  if (compact) {
    return (
      <div className="card p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-medium">Real-Time Summary</h3>
          <div>
            {isActive ? (
              <button onClick={stopSummarization} className="btn btn-sm btn-outline-danger">
                Stop
              </button>
            ) : (
              <button 
                onClick={startSummarization} 
                disabled={!isConnectedToSession || !activeSessionId}
                className="btn btn-sm btn-primary"
              >
                Start
              </button>
            )}
          </div>
        </div>
        
        {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
        
        <div className="bg-gray-50 dark:bg-dark-600 p-3 rounded max-h-[150px] overflow-y-auto">
          {latestSummary ? (
            <p className="text-sm">{latestSummary.text}</p>
          ) : (
            <p className="text-sm text-gray-500">No summary available yet</p>
          )}
        </div>
        
        {latestSummary && (
          <div className="text-xs text-gray-500 mt-1">
            Last updated: {formatTime(latestSummary.createdAt || latestSummary.created_at)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Real-Time Summary</h2>
        <div className="flex space-x-2">
          <select 
            className="input py-1 px-2 text-sm"
            value={summaryType}
            onChange={(e) => setSummaryType(e.target.value)}
            disabled={isActive}
          >
            <option value="incremental">Incremental</option>
            <option value="overall">Overall</option>
            <option value="key_points">Key Points</option>
            <option value="action_items">Action Items</option>
          </select>
          
          {isActive ? (
            <button onClick={stopSummarization} className="btn btn-danger py-1 px-3">
              Stop Summarization
            </button>
          ) : (
            <button 
              onClick={startSummarization} 
              disabled={!isConnectedToSession || !activeSessionId}
              className="btn btn-primary py-1 px-3"
            >
              Start Summarization
            </button>
          )}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-md mb-4">
          {error}
        </div>
      )}
      
      <div className="bg-gray-50 dark:bg-dark-600 p-4 rounded-lg">
        {latestSummary ? (
          <>
            <p className="whitespace-pre-line mb-2">{latestSummary.text}</p>
            <div className="text-xs text-gray-500 mt-2">
              Last updated: {formatTime(latestSummary.createdAt || latestSummary.created_at)}
            </div>
          </>
        ) : (
          <p className="text-gray-500">
            No summary available yet. Start real-time summarization to see updates here.
          </p>
        )}
      </div>
      
      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        <p>
          Summaries are generated automatically every {interval} seconds while the session is active.
        </p>
      </div>
    </div>
  );
};

export default RealTimeSummary;
