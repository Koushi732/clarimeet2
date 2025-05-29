/**
 * SummarizationService.ts
 * Service for handling API calls to summarization services
 */

import axios from 'axios';

interface SummarizationOptions {
  maxLength?: number;
  format?: 'bullet' | 'paragraph' | 'structured';
  focus?: 'key_points' | 'action_items' | 'decisions' | 'comprehensive';
  includeTimestamps?: boolean;
  apiKey?: string;
}

interface SummarizationResult {
  id: string;
  summary: string;
  keyPoints?: string[];
  actionItems?: string[];
  decisions?: string[];
  topics?: {
    name: string;
    summary: string;
    timestamp?: {
      start: number;
      end: number;
    };
  }[];
  status: 'completed' | 'processing' | 'failed';
  error?: string;
}

interface SummarizationStatusResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  estimatedCompletionTime?: number;
  error?: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

class SummarizationService {
  /**
   * Request a new summarization
   * @param transcriptionId The ID of the transcription to summarize
   * @param options Options for summarization
   * @returns A promise with the summarization request ID
   */
  public async requestSummarization(
    transcriptionId: string,
    options: SummarizationOptions = {}
  ): Promise<string> {
    try {
      const response = await axios.post(
        `${API_URL}/api/summarization/request`,
        {
          transcription_id: transcriptionId,
          ...options
        }
      );
      
      return response.data.id;
    } catch (error) {
      console.error('Error requesting summarization:', error);
      throw error;
    }
  }

  /**
   * Check the status of a summarization
   * @param summarizationId The ID of the summarization to check
   * @returns A promise with the summarization status
   */
  public async checkSummarizationStatus(
    summarizationId: string
  ): Promise<SummarizationStatusResponse> {
    try {
      const response = await axios.get(
        `${API_URL}/api/summarization/status/${summarizationId}`
      );
      
      return response.data;
    } catch (error) {
      console.error('Error checking summarization status:', error);
      throw error;
    }
  }

  /**
   * Get the result of a completed summarization
   * @param summarizationId The ID of the completed summarization
   * @returns A promise with the summarization result
   */
  public async getSummarizationResult(
    summarizationId: string
  ): Promise<SummarizationResult> {
    try {
      const response = await axios.get(
        `${API_URL}/api/summarization/result/${summarizationId}`
      );
      
      return response.data;
    } catch (error) {
      console.error('Error getting summarization result:', error);
      throw error;
    }
  }

  /**
   * Request a real-time summarization update
   * @param sessionId The session ID for the ongoing meeting
   * @param options Options for summarization
   * @returns A promise that resolves when the request is sent
   */
  public async requestRealtimeSummary(
    sessionId: string,
    options: SummarizationOptions = {}
  ): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/api/summarization/realtime/update`,
        {
          session_id: sessionId,
          ...options
        }
      );
    } catch (error) {
      console.error('Error requesting realtime summary update:', error);
      throw error;
    }
  }

  /**
   * Generate a summary from text input directly
   * @param text The text to summarize
   * @param options Options for summarization
   * @returns A promise with the summarization result
   */
  public async summarizeText(
    text: string,
    options: SummarizationOptions = {}
  ): Promise<SummarizationResult> {
    try {
      const response = await axios.post(
        `${API_URL}/api/summarization/text`,
        {
          text,
          ...options
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error summarizing text:', error);
      throw error;
    }
  }

  /**
   * Generate a custom summary with specific focus areas
   * @param transcriptionId The ID of the transcription to summarize
   * @param customPrompt A custom prompt to guide the summarization
   * @param options Options for summarization
   * @returns A promise with the summarization result
   */
  public async generateCustomSummary(
    transcriptionId: string,
    customPrompt: string,
    options: SummarizationOptions = {}
  ): Promise<SummarizationResult> {
    try {
      const response = await axios.post(
        `${API_URL}/api/summarization/custom`,
        {
          transcription_id: transcriptionId,
          custom_prompt: customPrompt,
          ...options
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error generating custom summary:', error);
      throw error;
    }
  }
}

export default new SummarizationService();
