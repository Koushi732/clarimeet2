import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useWebSocketBridge, WebSocketMessageType, MessageTypes } from './WebSocketContextBridge';
import { 
  SessionDetail, 
  Transcription, 
  Summary, 
  TranscriptionStatus,
  SummarizationStatus,
  ActiveSession,
  Session as SessionType
} from '../types';
import axios from 'axios';

// Update Session interface to include status field
interface Session {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  status?: 'idle' | 'recording' | 'processing' | 'completed' | 'error';
}

interface SessionContextType {
  sessions: Session[];
  currentSession: ActiveSession | null;
  isLoading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  getSessionById: (id: string) => Promise<SessionDetail | null>;
  uploadAudio: (file: File, title: string, description?: string) => Promise<string | null>;
  updateSession: (id: string, title?: string, description?: string) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  startTranscription: (sessionId: string, model?: string, language?: string) => Promise<boolean>;
  stopTranscription: (sessionId: string) => Promise<boolean>;
  generateSummary: (sessionId: string, summaryType?: string) => Promise<boolean>;
  exportSession: (sessionId: string, format?: string) => Promise<boolean>;
  setActiveSession: (session: Session | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<ActiveSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const { lastMessage, connectToSession, isConnectedToSession } = useWebSocketBridge();

  // Handle WebSocket messages related to transcription and summarization
  useEffect(() => {
    if (!lastMessage) return;
    
    console.log('Received WebSocket message:', lastMessage.type, lastMessage.data);
    
    // Process message even if we don't have a current session yet
    // This helps with initial data population
    if (!currentSession?.session && 
        (lastMessage.type === 'transcription_update' || 
         lastMessage.type === 'summary_update')) {
      console.log('Received data before session was set, checking if we should create session');
      // Try to extract session ID from the message
      const msgSessionId = lastMessage.data?.sessionId || lastMessage.data?.session_id;
      
      if (msgSessionId) {
        console.log(`Creating initial session context for session ${msgSessionId}`);
        // Create a basic session to hold the incoming data
        const initialSession: Session = {
          id: msgSessionId,
          title: 'Current Recording',
          description: 'Recording in progress',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          duration: 0,
          status: 'recording'
        };
        
        setCurrentSession({
          session: initialSession,
          recordingStatus: { isRecording: true, sessionId: msgSessionId },
          transcriptionStatus: { status: 'in_progress', sessionId: msgSessionId },
          summarizationStatus: null,
          currentTranscriptions: [],
          currentSummaries: []
        });
        
        return; // Wait for next update to process the actual data
      }
    }
    
    if (!currentSession?.session) return;
    
    const sessionId = currentSession.session.id;
    console.log(`Processing message for session ${sessionId}`);
    
    switch(lastMessage.type) {
      case MessageTypes.TRANSCRIPTION_UPDATE:
      case MessageTypes.TRANSCRIPTION: // Handle both message types
        let transcription;
        if (typeof lastMessage.data === 'string') {
          // Parse if the data is a string
          try {
            transcription = JSON.parse(lastMessage.data);
          } catch (e) {
            console.error('Failed to parse transcription data:', e);
            transcription = { text: lastMessage.data, timestamp: Date.now() / 1000 };
          }
        } else {
          transcription = lastMessage.data as Transcription;
        }
        
        // Generate an ID if missing
        if (!transcription.id) {
          transcription.id = `trans-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        }
        
        // Handle both sessionId and session_id formats
        const transSessionId = transcription.sessionId || transcription.session_id;
        
        if (transSessionId === sessionId || !transSessionId) { // Accept if matches or missing
          console.log('Adding new transcription:', transcription);
          setCurrentSession(prev => {
            if (!prev) return null;
            
            // Avoid duplicates by checking ID
            const exists = prev.currentTranscriptions.some(t => t.id === transcription.id);
            if (exists) return prev;
            
            return {
              ...prev,
              currentTranscriptions: [...prev.currentTranscriptions, transcription]
            };
          });
        }
        break;
        
      case MessageTypes.SUMMARY_UPDATE:
      case MessageTypes.SUMMARY: // Handle both message types
        let summary;
        if (typeof lastMessage.data === 'string') {
          // Parse if the data is a string
          try {
            summary = JSON.parse(lastMessage.data);
          } catch (e) {
            console.error('Failed to parse summary data:', e);
            summary = { text: lastMessage.data, timestamp: Date.now() / 1000 };
          }
        } else {
          summary = lastMessage.data as Summary;
        }
        
        // Generate an ID if missing
        if (!summary.id) {
          summary.id = `summ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        }
        
        // Handle both sessionId and session_id formats
        const summarySessionId = summary.sessionId || summary.session_id;
        
        if (summarySessionId === sessionId || !summarySessionId) { // Accept if matches or missing
          console.log('Adding new summary:', summary);
          setCurrentSession(prev => {
            if (!prev) return null;
            
            // Avoid duplicates by checking ID
            const exists = prev.currentSummaries.some(s => s.id === summary.id);
            if (exists) return prev;
            
            return {
              ...prev,
              currentSummaries: [...prev.currentSummaries, summary]
            };
          });
        }
        break;
        
      case 'transcription_status_update':
        const newStatus = lastMessage.data as TranscriptionStatus;
        // Convert string status to enum if needed
        const status = newStatus.status as TranscriptionStatus['status'];
        const transStatusSessionId = newStatus.sessionId;
        
        if (transStatusSessionId === sessionId || !transStatusSessionId) {
          console.log('Updating transcription status:', newStatus);
          setCurrentSession(prev => {
            if (!prev) return null;
            return {
              ...prev,
              transcriptionStatus: newStatus
            };
          });
        }
        break;
        
      case 'summarization_status_update':
        const newSummStatus = lastMessage.data as SummarizationStatus;
        // Convert string status to enum if needed
        const summStatus = newSummStatus.status as SummarizationStatus['status'];
        const summStatusSessionId = newSummStatus.sessionId;
        
        if (summStatusSessionId === sessionId || !summStatusSessionId) {
          console.log('Updating summarization status:', newSummStatus);
          setCurrentSession(prev => {
            if (!prev) return null;
            return {
              ...prev,
              summarizationStatus: summStatus
            };
          });
        }
        break;
        
      // Handle any other message types
      case MessageTypes.AUDIO_STATUS:
      case MessageTypes.SESSION_UPDATE:
      case MessageTypes.ERROR:
        console.log(`Received ${lastMessage.type} message:`, lastMessage.data);
        break;
        
      default:
        console.log(`Unhandled message type: ${lastMessage.type}`, lastMessage.data);
    }
  }, [lastMessage, currentSession]);

  // Fetch all sessions
  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.get<Session[]>('/sessions');
      setSessions(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Get session by ID with details
  const getSessionById = async (id: string): Promise<SessionDetail | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.get<SessionDetail>(`/sessions/${id}`);
      return response.data;
    } catch (err) {
      console.error(`Error fetching session ${id}:`, err);
      setError('Failed to load session details');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Upload audio file
  const uploadAudio = async (file: File, title: string, description?: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      if (description) {
        formData.append('description', description);
      }
      formData.append('auto_transcribe', 'true');
      formData.append('auto_summarize', 'true');
      
      const response = await axios.post<Session>('/audio/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Update sessions list
      await fetchSessions();
      
      return response.data.id;
    } catch (err) {
      console.error('Error uploading audio:', err);
      setError('Failed to upload audio file');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Update session details
  const updateSession = async (id: string, title?: string, description?: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await axios.put(`/sessions/${id}`, {
        title,
        description
      });
      
      // Update sessions list
      await fetchSessions();
      
      return true;
    } catch (err) {
      console.error(`Error updating session ${id}:`, err);
      setError('Failed to update session');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Delete session
  const deleteSession = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await axios.delete(`/sessions/${id}`);
      
      // Update sessions list
      await fetchSessions();
      
      return true;
    } catch (err) {
      console.error(`Error deleting session ${id}:`, err);
      setError('Failed to delete session');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Start transcription
  const startTranscription = async (sessionId: string, model?: string, language?: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await axios.post(`/transcription/${sessionId}/start`, {
        model: model || 'whisper-small',
        language: language || 'en'
      });
      
      return true;
    } catch (err) {
      console.error(`Error starting transcription for session ${sessionId}:`, err);
      setError('Failed to start transcription');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Stop transcription
  const stopTranscription = async (sessionId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await axios.post(`/transcription/${sessionId}/stop`);
      
      return true;
    } catch (err) {
      console.error(`Error stopping transcription for session ${sessionId}:`, err);
      setError('Failed to stop transcription');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Generate summary
  const generateSummary = async (sessionId: string, summaryType?: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await axios.post(`/summarization/${sessionId}/generate`, {
        summary_type: summaryType || 'overall',
        model: 'bart-large-cnn'
      });
      
      return true;
    } catch (err) {
      console.error(`Error generating summary for session ${sessionId}:`, err);
      setError('Failed to generate summary');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Export session
  const exportSession = async (sessionId: string, format: string = 'json'): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`/sessions/${sessionId}/export`, {
        params: { format }
      });
      
      // Create and download file
      const dataStr = JSON.stringify(response.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      return true;
    } catch (err) {
      console.error(`Error exporting session ${sessionId}:`, err);
      setError('Failed to export session');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Set active session
  const setActiveSession = (session: Session | null) => {
    if (!session) {
      setCurrentSession(null);
      return;
    }
    
    // Initialize with empty data
    setCurrentSession({
      session,
      recordingStatus: null,
      transcriptionStatus: null,
      summarizationStatus: null,
      currentTranscriptions: [],
      currentSummaries: []
    });
    
    // Connect to session-specific WebSocket for real-time updates
    connectToSession(session.id);
    
    // Log connection attempt
    console.log(`Connecting to session WebSocket for session: ${session.id}`);
    
    // Fetch initial transcriptions and summaries
    getSessionById(session.id).then(sessionDetail => {
      if (sessionDetail) {
        setCurrentSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            currentTranscriptions: sessionDetail.transcriptions || [],
            currentSummaries: sessionDetail.summaries || []
          };
        });
        
        console.log(`Loaded session details for session: ${session.id}`);
      }
    }).catch(err => {
      console.error(`Error loading session details: ${err.message}`);
      setError('Failed to load session details. Please try refreshing the page.');
    });
  };

  // Load sessions on component mount
  useEffect(() => {
    fetchSessions();
  }, []);

  return (
    <SessionContext.Provider value={{
      sessions,
      currentSession,
      isLoading,
      error,
      fetchSessions,
      getSessionById,
      uploadAudio,
      updateSession,
      deleteSession,
      startTranscription,
      stopTranscription,
      generateSummary,
      exportSession,
      setActiveSession
    }}>
      {children}
    </SessionContext.Provider>
  );
};
