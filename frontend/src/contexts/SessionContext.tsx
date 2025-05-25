import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Session, 
  SessionDetail, 
  Transcription, 
  Summary, 
  TranscriptionStatus, 
  SummarizationStatus, 
  ActiveSession 
} from '../types';
import { useWebSocketBridge, WebSocketMessageType, WebSocketMessage } from './WebSocketContextBridge';

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
    if (!lastMessage || !currentSession?.session) return;
    
    const sessionId = currentSession.session.id;
    
    switch(lastMessage.type) {
      case 'transcription_update':
        const transcription = lastMessage.data as Transcription;
        if (transcription.sessionId === sessionId) {
          setCurrentSession(prev => {
            if (!prev) return null;
            return {
              ...prev,
              currentTranscriptions: [...prev.currentTranscriptions, transcription]
            };
          });
        }
        break;
        
      case 'summary_update':
        const summary = lastMessage.data as Summary;
        if (summary.sessionId === sessionId) {
          setCurrentSession(prev => {
            if (!prev) return null;
            return {
              ...prev,
              currentSummaries: [...prev.currentSummaries, summary]
            };
          });
        }
        break;
        
      case 'transcription_status_update':
        const transStatus = lastMessage.data as TranscriptionStatus;
        if (transStatus.sessionId === sessionId) {
          setCurrentSession(prev => {
            if (!prev) return null;
            return {
              ...prev,
              transcriptionStatus: transStatus
            };
          });
        }
        break;
        
      case 'summarization_status_update':
        const summStatus = lastMessage.data as SummarizationStatus;
        if (summStatus.sessionId === sessionId) {
          setCurrentSession(prev => {
            if (!prev) return null;
            return {
              ...prev,
              summarizationStatus: summStatus
            };
          });
        }
        break;
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
