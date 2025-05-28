import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { DocumentTextIcon, MicrophoneIcon, ArrowPathIcon, ClipboardDocumentIcon, UserIcon } from '@heroicons/react/24/solid';

interface Transcription {
  id: string;
  text: string;
  timestamp: number;
  speaker_id?: string;
  speaker_name?: string;
  confidence?: number;
}

interface LiveTranscriptionPanelProps {
  session: any; // Using any for now, should be properly typed with your session interface
}

const LiveTranscriptionPanel: React.FC<LiveTranscriptionPanelProps> = ({ session }) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const transcriptionRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Auto-scroll to bottom when new transcriptions come in
  useEffect(() => {
    if (autoScroll && transcriptionRef.current && session?.currentTranscriptions?.length > 0) {
      transcriptionRef.current.scrollTop = transcriptionRef.current.scrollHeight;
    }
  }, [session?.currentTranscriptions, autoScroll]);
  
  // Reset copy message after timeout
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);
  
  // Copy all transcriptions to clipboard
  const handleCopyAll = useCallback(() => {
    if (!session?.currentTranscriptions?.length) return;
    
    const transcriptionText = session.currentTranscriptions
      .map((transcription: Transcription) => {
        const time = new Date(transcription.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const speaker = transcription.speaker_name ? `[${transcription.speaker_name}]` : '';
        return `[${time}] ${speaker} ${transcription.text}`;
      })
      .join('\n\n');
    
    navigator.clipboard.writeText(transcriptionText)
      .then(() => {
        setCopySuccess('Copied!');
        
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        
        copyTimeoutRef.current = setTimeout(() => {
          setCopySuccess(null);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text:', err);
        setCopySuccess('Failed to copy');
      });
  }, [session?.currentTranscriptions]);

  // Group transcriptions by speaker
  const groupTranscriptionsBySpeaker = (transcriptions: Transcription[]) => {
    const groupedTranscriptions: Transcription[][] = [];
    let currentGroup: Transcription[] = [];
    let currentSpeakerId: string | undefined = undefined;
    
    transcriptions.forEach((transcription) => {
      if (currentSpeakerId !== transcription.speaker_id) {
        if (currentGroup.length > 0) {
          groupedTranscriptions.push([...currentGroup]);
          currentGroup = [];
        }
        currentSpeakerId = transcription.speaker_id;
      }
      currentGroup.push(transcription);
    });
    
    if (currentGroup.length > 0) {
      groupedTranscriptions.push(currentGroup);
    }
    
    return groupedTranscriptions;
  };

  if (!session?.session) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
        <MicrophoneIcon className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">No active session</p>
        <p className="text-xs mt-1">Start recording to see live transcription</p>
      </div>
    );
  }

  if (!session?.currentTranscriptions || session.currentTranscriptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
        <MicrophoneIcon className="h-10 w-10 mb-2 opacity-50 animate-pulse" />
        <p className="text-sm">Waiting for transcription</p>
        <p className="text-xs mt-1">Start speaking to see transcription</p>
      </div>
    );
  }

  // Group transcriptions for display
  const groupedTranscriptions = groupTranscriptionsBySpeaker(session.currentTranscriptions);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-primary-700 dark:text-primary-400">
          Live Transcription
        </h3>
        <div className="flex items-center space-x-1">
          {copySuccess && (
            <span className="text-xs text-green-600 dark:text-green-400 mr-1">
              {copySuccess}
            </span>
          )}
          
          <button
            onClick={handleCopyAll}
            title="Copy all transcriptions"
            className="text-xs p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-dark-700 dark:hover:bg-dark-600 dark:text-gray-300 transition-colors"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
          </button>
          
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll is on' : 'Auto-scroll is off'}
            className={`text-xs px-2 py-1 rounded ${autoScroll ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300' : 'bg-gray-100 text-gray-700 dark:bg-dark-700 dark:text-gray-300'}`}
          >
            {autoScroll ? 'Auto-scroll: On' : 'Auto-scroll: Off'}
          </button>
        </div>
      </div>

      <div 
        ref={transcriptionRef}
        className="overflow-y-auto max-h-60 bg-gray-50 dark:bg-dark-700 rounded-md p-3 text-sm"
      >
        {groupedTranscriptions.map((group, groupIndex) => (
          <motion.div
            key={`group-${groupIndex}-${group[0].id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`mb-3 pb-3 ${groupIndex < groupedTranscriptions.length - 1 ? 'border-b border-gray-200 dark:border-dark-600' : ''}`}
          >
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary-100 dark:bg-primary-800 flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-primary-700 dark:text-primary-300" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center text-xs text-primary-800 dark:text-primary-200 mb-1">
                  <div className="flex items-center">
                    <span className="font-medium">
                      {group[0].speaker_name || `Speaker ${group[0].speaker_id || 'Unknown'}`}
                    </span>
                    <span className="ml-2">
                      {new Date(group[0].timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  <button 
                    onClick={() => {
                      const text = group.map(t => t.text).join(' ');
                      navigator.clipboard.writeText(text)
                        .then(() => {
                          setCopySuccess('Copied!');
                          if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                          copyTimeoutRef.current = setTimeout(() => setCopySuccess(null), 2000);
                        })
                        .catch(err => console.error('Failed to copy:', err));
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-dark-600 transition-opacity"
                    title="Copy this transcription"
                  >
                    <ClipboardDocumentIcon className="h-3 w-3 text-primary-600 dark:text-primary-400" />
                  </button>
                </div>
                <div className="text-gray-700 dark:text-gray-200">
                  {group.map((transcription, index) => (
                    <span key={transcription.id || index} className="whitespace-pre-line">
                      {transcription.text}{' '}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {session?.transcriptionStatus?.status === 'in_progress' && (
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

export default LiveTranscriptionPanel;
