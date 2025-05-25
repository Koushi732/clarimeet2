// Audio Types
export interface AudioDevice {
  id: string;
  name: string;
  isInput: boolean;
  isDefault: boolean;
  isLoopback?: boolean;
}

export interface RecordingStatus {
  sessionId: string;
  isRecording: boolean;
  duration: number;
  audioLevel: number;
}

// Transcription Types
export interface Transcription {
  id: string;
  sessionId: string;
  timestamp: number;
  endTimestamp?: number;
  text: string;
  confidence?: number;
  speaker?: string;
  createdAt: string;
}

export interface TranscriptionStatus {
  sessionId: string;
  status: 'not_started' | 'transcribing' | 'processing' | 'completed' | 'error' | 'stopped';
  model?: string;
  language?: string;
  error?: string;
}

// Summary Types
export interface Summary {
  id: string;
  sessionId: string;
  summaryType: string;
  text: string;
  segmentStart?: number;
  segmentEnd?: number;
  createdAt: string;
}

export interface SummarizationStatus {
  sessionId: string;
  status: 'not_started' | 'generating' | 'running' | 'completed' | 'error' | 'stopped';
  summaryType?: string;
  model?: string;
  intervalSeconds?: number;
  error?: string;
}

// Session Types
export interface Session {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  audioPath?: string;
  isLive: boolean;
}

export interface SessionDetail extends Session {
  transcriptions: Transcription[];
  summaries: Summary[];
}

export interface SessionUpdate {
  title?: string;
  description?: string;
}

// Settings Type
export interface AppSettings {
  theme: 'light' | 'dark';
  language: string;
  transcriptionModel: string;
  summarizationModel: string;
  autoSave: boolean;
  autoTranscribe: boolean;
  autoSummarize: boolean;
}

// WebSocket Message Types
export type WebSocketMessageType = 
  | 'transcription_update'
  | 'summary_update'
  | 'audio_level_update'
  | 'recording_status_update'
  | 'transcription_status_update'
  | 'summarization_status_update'
  | 'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// UI State Types
export interface ActiveSession {
  session: Session | null;
  recordingStatus: RecordingStatus | null;
  transcriptionStatus: TranscriptionStatus | null;
  summarizationStatus: SummarizationStatus | null;
  currentTranscriptions: Transcription[];
  currentSummaries: Summary[];
}
