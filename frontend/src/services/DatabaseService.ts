import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export interface Session {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  status: string;
  language: string;
  metadata: any;
}

export interface Speaker {
  id: string;
  session_id: string;
  name: string;
  word_count: number;
  talk_time: number;
}

export interface Transcription {
  id: string;
  session_id: string;
  text: string;
  is_final: boolean;
  timestamp: number;
  speaker_id: string;
  speaker_name: string;
  confidence: number;
  start_time: number;
  end_time: number;
}

export interface Summary {
  id: string;
  session_id: string;
  content: string;
  type: string;
  created_at: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  sender: string;
  receiver: string;
  content: string;
  timestamp: number;
}

export interface Language {
  code: string;
  name: string;
  level: 'full' | 'beta' | 'limited';
}

/**
 * Service for interacting with the SQLite database through the API
 */
export const DatabaseService = {
  // Session endpoints
  getSessions: async (): Promise<Session[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/sessions`);
      return response.data.sessions;
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  },
  
  getSession: async (sessionId: string): Promise<Session | null> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching session ${sessionId}:`, error);
      return null;
    }
  },
  
  getSessionWithData: async (sessionId: string): Promise<{
    session: Session | null;
    transcriptions: Transcription[];
    summaries: Summary[];
    speakers: Speaker[];
    chat_messages: ChatMessage[];
  }> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/data`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching session data for ${sessionId}:`, error);
      return {
        session: null,
        transcriptions: [],
        summaries: [],
        speakers: [],
        chat_messages: []
      };
    }
  },
  
  createSession: async (name: string, description: string = "", language: string = "en"): Promise<Session | null> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/sessions`, {
        name,
        description,
        language
      });
      return response.data;
    } catch (error) {
      console.error('Error creating session:', error);
      return null;
    }
  },
  
  updateSession: async (sessionId: string, updates: Partial<Session>): Promise<Session | null> => {
    try {
      const response = await axios.put(`${API_BASE_URL}/sessions/${sessionId}`, updates);
      return response.data;
    } catch (error) {
      console.error(`Error updating session ${sessionId}:`, error);
      return null;
    }
  },
  
  deleteSession: async (sessionId: string): Promise<boolean> => {
    try {
      await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
      return false;
    }
  },
  
  // Transcription endpoints
  getSessionTranscriptions: async (sessionId: string): Promise<Transcription[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/transcriptions`);
      return response.data.transcriptions;
    } catch (error) {
      console.error(`Error fetching transcriptions for session ${sessionId}:`, error);
      return [];
    }
  },
  
  getFullTranscript: async (sessionId: string, includeSpeakers: boolean = true): Promise<string> => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/sessions/${sessionId}/transcript?include_speakers=${includeSpeakers}`
      );
      return response.data.transcript;
    } catch (error) {
      console.error(`Error fetching transcript for session ${sessionId}:`, error);
      return "";
    }
  },
  
  // Summary endpoints
  getSessionSummaries: async (sessionId: string): Promise<Summary[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/summaries`);
      return response.data.summaries;
    } catch (error) {
      console.error(`Error fetching summaries for session ${sessionId}:`, error);
      return [];
    }
  },
  
  getLatestSummary: async (sessionId: string, summaryType?: string): Promise<Summary | null> => {
    try {
      let url = `${API_BASE_URL}/sessions/${sessionId}/summary`;
      if (summaryType) {
        url += `?summary_type=${summaryType}`;
      }
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error(`Error fetching latest summary for session ${sessionId}:`, error);
      return null;
    }
  },
  
  // Speaker endpoints
  getSessionSpeakers: async (sessionId: string): Promise<Speaker[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/speakers/session/${sessionId}`);
      return response.data.speakers;
    } catch (error) {
      console.error(`Error fetching speakers for session ${sessionId}:`, error);
      return [];
    }
  },
  
  updateSpeakerName: async (sessionId: string, speakerId: string, name: string): Promise<Speaker | null> => {
    try {
      const response = await axios.put(`${API_BASE_URL}/speakers/${speakerId}`, {
        name,
        session_id: sessionId
      });
      return response.data;
    } catch (error) {
      console.error(`Error updating speaker ${speakerId}:`, error);
      return null;
    }
  },
  
  getSpeakerStatistics: async (sessionId: string): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/speakers/session/${sessionId}/stats`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching speaker statistics for session ${sessionId}:`, error);
      return {};
    }
  },
  
  // Language endpoints
  getAllLanguages: async (): Promise<Language[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/languages`);
      return response.data.languages;
    } catch (error) {
      console.error('Error fetching languages:', error);
      return [];
    }
  },
  
  getSupportedLanguages: async (level?: string): Promise<Language[]> => {
    try {
      let url = `${API_BASE_URL}/languages/supported`;
      if (level) {
        url += `?level=${level}`;
      }
      const response = await axios.get(url);
      return response.data.languages;
    } catch (error) {
      console.error('Error fetching supported languages:', error);
      return [];
    }
  },
  
  getRecentLanguages: async (userId: string): Promise<Language[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/languages/recent?user_id=${userId}`);
      return response.data.languages;
    } catch (error) {
      console.error(`Error fetching recent languages for user ${userId}:`, error);
      return [];
    }
  },
  
  addRecentLanguage: async (userId: string, languageCode: string): Promise<Language[]> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/languages/recent`, {
        user_id: userId,
        language_code: languageCode
      });
      return response.data.languages;
    } catch (error) {
      console.error(`Error adding recent language for user ${userId}:`, error);
      return [];
    }
  },
  
  // Settings endpoints
  getUserSettings: async (userId: string): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/user/${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching settings for user ${userId}:`, error);
      return {};
    }
  },
  
  // Individual session setting - helper methods for consistency
  getSessionSetting: async (sessionId: string, key: string): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/session/${sessionId}/${key}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching setting ${key} for session ${sessionId}:`, error);
      return { value: null };
    }
  },
  
  saveSessionSetting: async (sessionId: string, key: string, value: any): Promise<boolean> => {
    try {
      await axios.put(`${API_BASE_URL}/settings/session/${sessionId}/${key}`, { value });
      return true;
    } catch (error) {
      console.error(`Error saving setting ${key} for session ${sessionId}:`, error);
      return false;
    }
  },
  
  saveUserSettings: async (userId: string, settings: any): Promise<boolean> => {
    try {
      await axios.put(`${API_BASE_URL}/settings/user/${userId}`, { settings });
      return true;
    } catch (error) {
      console.error(`Error saving settings for user ${userId}:`, error);
      return false;
    }
  },
  
  getSessionSettings: async (sessionId: string): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/session/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching settings for session ${sessionId}:`, error);
      return null;
    }
  },
  
  saveSessionSettings: async (sessionId: string, settings: any): Promise<boolean> => {
    try {
      await axios.put(`${API_BASE_URL}/settings/session/${sessionId}`, { settings });
      return true;
    } catch (error) {
      console.error(`Error saving settings for session ${sessionId}:`, error);
      return false;
    }
  },
  
  getSetting: async (userId: string, key: string): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/user/${userId}/${key}`);
      return response.data.value;
    } catch (error) {
      console.error(`Error fetching setting ${key} for user ${userId}:`, error);
      return null;
    }
  },
  
  updateSetting: async (userId: string, key: string, value: any): Promise<boolean> => {
    try {
      await axios.put(`${API_BASE_URL}/settings/user/${userId}/${key}`, { value });
      return true;
    } catch (error) {
      console.error(`Error updating setting ${key} for user ${userId}:`, error);
      return false;
    }
  },
  
  // Default settings
  getDefaultTranscriptionSettings: async (): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/default-transcription`);
      return response.data;
    } catch (error) {
      console.error('Error fetching default transcription settings:', error);
      return {
        language: "en",
        speakerDiarization: true,
        model: "deepgram",
        fillerWords: false,
        punctuation: true
      };
    }
  },
  
  getDefaultSummarizationSettings: async (): Promise<any> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/settings/default-summarization`);
      return response.data;
    } catch (error) {
      console.error('Error fetching default summarization settings:', error);
      return {
        enabled: true,
        model: "gemini",
        minTranscriptLength: 300,
        autoSummarizeInterval: 120
      };
    }
  }
};

export default DatabaseService;
