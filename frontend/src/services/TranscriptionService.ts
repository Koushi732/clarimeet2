/**
 * TranscriptionService.ts
 * Service for handling API calls to transcription services
 */

import axios from 'axios';

interface TranscriptionOptions {
  language?: string;
  model?: 'default' | 'enhanced' | 'fast';
  speakerDiarization?: boolean;
  maxSpeakers?: number;
  audioFormat?: string;
  apiKey?: string;
}

interface TranscriptionResult {
  id: string;
  text: string;
  segments?: {
    id: string;
    start: number;
    end: number;
    text: string;
    speakerId?: string;
    confidence: number;
  }[];
  language: string;
  status: 'completed' | 'processing' | 'failed';
  error?: string;
}

interface TranscriptionStatusResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  estimatedCompletionTime?: number;
  error?: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

class TranscriptionService {
  /**
   * Request a new transcription
   * @param audioBlob The audio blob to transcribe
   * @param options Options for transcription
   * @returns A promise with the transcription request ID
   */
  public async requestTranscription(
    audioBlob: Blob,
    options: TranscriptionOptions = {}
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', audioBlob);
    
    if (options.language) {
      formData.append('language', options.language);
    }
    
    if (options.model) {
      formData.append('model', options.model);
    }
    
    if (options.speakerDiarization !== undefined) {
      formData.append('speaker_diarization', options.speakerDiarization.toString());
    }
    
    if (options.maxSpeakers) {
      formData.append('max_speakers', options.maxSpeakers.toString());
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/transcription/request`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
          },
        }
      );
      
      return response.data.id;
    } catch (error) {
      console.error('Error requesting transcription:', error);
      throw error;
    }
  }

  /**
   * Check the status of a transcription
   * @param transcriptionId The ID of the transcription to check
   * @returns A promise with the transcription status
   */
  public async checkTranscriptionStatus(
    transcriptionId: string
  ): Promise<TranscriptionStatusResponse> {
    try {
      const response = await axios.get(
        `${API_URL}/api/transcription/status/${transcriptionId}`
      );
      
      return response.data;
    } catch (error) {
      console.error('Error checking transcription status:', error);
      throw error;
    }
  }

  /**
   * Get the result of a completed transcription
   * @param transcriptionId The ID of the completed transcription
   * @returns A promise with the transcription result
   */
  public async getTranscriptionResult(
    transcriptionId: string
  ): Promise<TranscriptionResult> {
    try {
      const response = await axios.get(
        `${API_URL}/api/transcription/result/${transcriptionId}`
      );
      
      return response.data;
    } catch (error) {
      console.error('Error getting transcription result:', error);
      throw error;
    }
  }

  /**
   * Stream audio to the transcription service in real-time
   * @param audioChunk The audio chunk to stream
   * @param sessionId The session ID for the streaming session
   * @returns A promise that resolves when the chunk is sent
   */
  public async streamAudioChunk(
    audioChunk: Blob,
    sessionId: string
  ): Promise<void> {
    const formData = new FormData();
    formData.append('file', audioChunk);
    formData.append('session_id', sessionId);

    try {
      await axios.post(
        `${API_URL}/api/transcription/stream`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
    } catch (error) {
      console.error('Error streaming audio chunk:', error);
      throw error;
    }
  }

  /**
   * Start a new streaming transcription session
   * @param options Options for the streaming session
   * @returns A promise with the session ID
   */
  public async startStreamingSession(
    options: TranscriptionOptions = {}
  ): Promise<string> {
    try {
      const response = await axios.post(
        `${API_URL}/api/transcription/session/start`,
        options
      );
      
      return response.data.session_id;
    } catch (error) {
      console.error('Error starting streaming session:', error);
      throw error;
    }
  }

  /**
   * End a streaming transcription session
   * @param sessionId The ID of the session to end
   * @returns A promise that resolves when the session is ended
   */
  public async endStreamingSession(sessionId: string): Promise<void> {
    try {
      await axios.post(`${API_URL}/api/transcription/session/end`, {
        session_id: sessionId,
      });
    } catch (error) {
      console.error('Error ending streaming session:', error);
      throw error;
    }
  }
}

export default new TranscriptionService();
