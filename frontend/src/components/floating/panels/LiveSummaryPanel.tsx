import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DocumentTextIcon, DocumentMagnifyingGlassIcon } from '@heroicons/react/24/solid';

interface LiveSummaryPanelProps {
  session: any; // Using any for now, should be properly typed with your session interface
}

const LiveSummaryPanel: React.FC<LiveSummaryPanelProps> = ({ session }) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const summaryRef = React.useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new summaries come in
  useEffect(() => {
    if (autoScroll && summaryRef.current && session?.currentSummaries?.length > 0) {
      summaryRef.current.scrollTop = summaryRef.current.scrollHeight;
    }
  }, [session?.currentSummaries, autoScroll]);

  if (!session?.session) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
        <DocumentMagnifyingGlassIcon className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">No active session</p>
        <p className="text-xs mt-1">Start recording to see live summaries</p>
      </div>
    );
  }

  if (!session?.currentSummaries || session.currentSummaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
        <DocumentMagnifyingGlassIcon className="h-10 w-10 mb-2 opacity-50 animate-pulse" />
        <p className="text-sm">Waiting for summaries</p>
        <p className="text-xs mt-1">
          {session?.currentTranscriptions?.length > 0 
            ? 'Processing transcriptions...'
            : 'Start speaking to generate transcriptions'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-primary-700 dark:text-primary-400">
          Live Summary
        </h3>
        <div className="flex items-center">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-1 rounded ${autoScroll ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300' : 'bg-gray-100 text-gray-700 dark:bg-dark-700 dark:text-gray-300'}`}
          >
            {autoScroll ? 'Auto-scroll: On' : 'Auto-scroll: Off'}
          </button>
        </div>
      </div>

      <div 
        ref={summaryRef}
        className="overflow-y-auto max-h-60 bg-primary-50 dark:bg-dark-700 rounded-md p-3 text-sm"
      >
        {session.currentSummaries.map((summary: any, index: number) => (
          <motion.div
            key={summary.id || index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`mb-3 pb-3 ${index < session.currentSummaries.length - 1 ? 'border-b border-primary-100 dark:border-dark-600' : ''}`}
          >
            <div className="flex items-start space-x-2">
              <DocumentTextIcon className="h-4 w-4 text-primary-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-primary-800 dark:text-primary-200 mb-1">
                  {new Date(summary.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {summary.summary_type && (
                    <span className="ml-2 px-1.5 py-0.5 bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200 rounded-full text-xs">
                      {summary.summary_type}
                    </span>
                  )}
                </div>
                <div className="text-gray-700 dark:text-gray-200">{summary.text}</div>
              </div>
            </div>
          </motion.div>
        ))}

        {session?.summarizationStatus?.status === 'generating' && (
          <div className="flex items-center justify-center py-2">
            <div className="animate-pulse flex space-x-1">
              <div className="h-2 w-2 bg-primary-500 rounded-full"></div>
              <div className="h-2 w-2 bg-primary-500 rounded-full delay-75"></div>
              <div className="h-2 w-2 bg-primary-500 rounded-full delay-150"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveSummaryPanel;
