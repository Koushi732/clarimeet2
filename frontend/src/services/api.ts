import axios from 'axios';

// Create an axios instance with default config
const api = axios.create({
  baseURL: 'http://localhost:8000', // Force localhost for development in Electron
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 second timeout
});

// Add request interceptor for logging and potential auth token injection
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    // Here you could add authentication tokens if needed
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Extract useful error information
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
    const statusCode = error.response?.status;
    
    // Log error details
    console.error(`API Error (${statusCode}):`, errorMessage);
    
    // Special handling for common errors
    if (statusCode === 404) {
      console.error('Resource not found. Please check endpoint URL.');
    } else if (statusCode === 401 || statusCode === 403) {
      console.error('Authentication/authorization error.');
    } else if (statusCode >= 500) {
      console.error('Server error. Please try again later or contact support.');
    }
    
    return Promise.reject({
      message: errorMessage,
      statusCode,
      originalError: error
    });
  }
);

// Audio API
export const audioApi = {
  // Get all available audio devices
  getDevices: () => api.get('/audio/devices'),
  
  // Start recording
  startRecording: (deviceId: string, title: string, description?: string, loopback = true) => 
    api.post('/audio/start', { device_id: deviceId, title, description, loopback }),
  
  // Stop recording
  stopRecording: (sessionId: string, autoTranscribe = true, autoSummarize = true) => 
    api.post(`/audio/stop/${sessionId}`, { auto_transcribe: autoTranscribe, auto_summarize: autoSummarize }),
  
  // Get recording status
  getRecordingStatus: (sessionId: string) => api.get(`/audio/status/${sessionId}`),
  
  // Upload audio file
  uploadAudio: (file: File, title: string, description?: string, autoTranscribe = true, autoSummarize = true) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    if (description) formData.append('description', description);
    formData.append('auto_transcribe', autoTranscribe.toString());
    formData.append('auto_summarize', autoSummarize.toString());
    
    return api.post('/audio/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

// Session API
export const sessionApi = {
  // Get all sessions
  getSessions: () => api.get('/sessions'),
  
  // Get session by ID
  getSessionById: (sessionId: string) => api.get(`/sessions/${sessionId}`),
  
  // Update session
  updateSession: (sessionId: string, title?: string, description?: string) => 
    api.put(`/sessions/${sessionId}`, { title, description }),
  
  // Delete session
  deleteSession: (sessionId: string) => api.delete(`/sessions/${sessionId}`),
  
  // Export session
  exportSession: (sessionId: string, format = 'json') => 
    api.get(`/sessions/${sessionId}/export`, { params: { format } }),
};

// Transcription API
export const transcriptionApi = {
  // Get transcriptions for a session
  getTranscriptions: (sessionId: string) => api.get(`/transcription/${sessionId}`),
  
  // Start transcription
  startTranscription: (sessionId: string, model = 'whisper-small', language = 'en') => 
    api.post(`/transcription/${sessionId}/start`, { model, language }),
  
  // Stop transcription
  stopTranscription: (sessionId: string) => api.post(`/transcription/${sessionId}/stop`),
  
  // Get transcription status
  getTranscriptionStatus: (sessionId: string) => api.get(`/transcription/${sessionId}/status`),
  
  // Process audio file
  processAudio: (sessionId: string, model = 'whisper-small', language = 'en') => 
    api.post(`/transcription/${sessionId}/process`, { model, language }),
};

// Summarization API
export const summarizationApi = {
  // Get summaries for a session
  getSummaries: (sessionId: string, summaryType?: string) => 
    api.get(`/summarization/${sessionId}`, { params: { summary_type: summaryType } }),
  
  // Generate summary
  generateSummary: (
    sessionId: string, 
    summaryType = 'overall', 
    model = 'bart-large-cnn', 
    segmentStart?: number, 
    segmentEnd?: number
  ) => 
    api.post(`/summarization/${sessionId}/generate`, { 
      summary_type: summaryType, 
      model, 
      segment_start: segmentStart, 
      segment_end: segmentEnd 
    }),
  
  // Start real-time summarization
  startRealtimeSummarization: (
    sessionId: string, 
    summaryType = 'incremental', 
    model = 'bart-large-cnn',
    intervalSeconds = 60
  ) => 
    api.post(`/summarization/${sessionId}/start-realtime`, {
      summary_type: summaryType,
      model,
      interval_seconds: intervalSeconds
    }),
  
  // Stop real-time summarization
  stopRealtimeSummarization: (sessionId: string) => 
    api.post(`/summarization/${sessionId}/stop-realtime`),
  
  // Get summarization status
  getSummarizationStatus: (sessionId: string) => 
    api.get(`/summarization/${sessionId}/status`),
};

// Export all APIs as a single object
export default {
  audio: audioApi,
  session: sessionApi,
  transcription: transcriptionApi,
  summarization: summarizationApi,
};
