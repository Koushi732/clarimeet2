import * as React from 'react';
import { useWebSocketBridge, WebSocketMessageType, WebSocketMessage } from './WebSocketContextBridge';
import { useSettingsContext } from './SettingsContext';
import api from '../services/api';

// Define interfaces for audio context
export interface AudioDevice {
  id: string;
  name: string;
  isInput: boolean;
  isOutput: boolean;
  isLoopback: boolean;
  isDefault: boolean;
}

export interface RecordingStatus {
  isRecording: boolean;
  sessionId: string | null;
  startTime: string | null;
  duration: number;
  audioLevel: number;
  errorMessage: string | null;
}

interface AudioContextType {
  devices: AudioDevice[];
  selectedDevice: AudioDevice | null;
  isLoading: boolean;
  error: string | null;
  recordingStatus: RecordingStatus | null;
  refreshDevices: () => Promise<void>;
  selectDevice: (device: AudioDevice) => void;
  startRecording: (title: string, description?: string) => Promise<string | null>;
  stopRecording: (sessionId: string) => Promise<boolean>;
  getAudioLevel: () => number;
  uploadAudio: (file: File, title: string, description?: string) => Promise<string | null>;
}

const AudioContext = React.createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = React.useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

export const AudioProvider = ({ children }: { children: React.ReactNode }) => {
  const [devices, setDevices] = React.useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = React.useState<AudioDevice | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = React.useState<RecordingStatus | null>(null);
  
  // Keep a reference to the active session ID
  const activeSessionRef = React.useRef<string | null>(null);
  // Audio level simulation (in a real app, this would come from the backend)
  const audioLevelRef = React.useRef<number>(0.05);
  // Reference for status polling interval
  const statusPollingRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const { lastMessage, addMessageHandler, connectToSession, connectionStatus } = useWebSocketBridge();
  const { settings } = useSettingsContext();

  // Set up WebSocket message handlers
  React.useEffect(() => {
    // Handler for audio status updates
    const unsubscribeAudioStatus = addMessageHandler('audio_status', (data) => {
      const audioStatus = data as RecordingStatus;
      setRecordingStatus(audioStatus);
      audioLevelRef.current = audioStatus.audioLevel;
    });
    
    // Handler for error messages
    const unsubscribeErrorMessages = addMessageHandler('error', (data) => {
      if (data && data.message) {
        setError(data.message);
        console.error('WebSocket error message:', data.message);
      }
    });
    
    return () => {
      unsubscribeAudioStatus();
      unsubscribeErrorMessages();
      // Clear any polling intervals on unmount
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
    };
  }, [addMessageHandler]);
  
  // Simulated audio level for development/demo purposes
  React.useEffect(() => {
    if (recordingStatus?.isRecording) {
      const simulateAudioLevel = setInterval(() => {
        // Simulate varying audio levels between 0.05 and 0.8
        audioLevelRef.current = 0.05 + Math.random() * 0.75;
      }, 100);
      
      return () => clearInterval(simulateAudioLevel);
    }
  }, [recordingStatus?.isRecording]);

  // Load available audio devices on component mount
  React.useEffect(() => {
    refreshDevices();
  }, []);

  // Refresh the list of available audio devices
  const refreshDevices = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await api.audio.getDevices();
      setDevices(response.data);
      
      // Auto-select default loopback device if available, otherwise first input device
      const defaultLoopback = response.data.find(d => d.isLoopback && d.isDefault);
      const firstLoopback = response.data.find(d => d.isLoopback);
      const firstInput = response.data.find(d => d.isInput);
      
      setSelectedDevice(defaultLoopback || firstLoopback || firstInput || null);
    } catch (err) {
      console.error('Error fetching audio devices:', err);
      setError('Failed to load audio devices. Please check your microphone permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  // Select an audio device
  const selectDevice = (device: AudioDevice) => {
    setSelectedDevice(device);
  };

  // Get the current audio level (for visualizations)
  const getAudioLevel = React.useCallback(() => {
    return recordingStatus?.isRecording ? audioLevelRef.current : 0;
  }, [recordingStatus?.isRecording]);

  // Start recording
  const startRecording = async (title: string, description?: string): Promise<string | null> => {
    if (!selectedDevice) {
      setError('No audio device selected');
      return null;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // First create a session and start recording
      const response = await api.audio.startRecording(
        selectedDevice.id,
        title,
        description,
        selectedDevice.isLoopback
      );
      
      const sessionId = response.data.id;
      activeSessionRef.current = sessionId;
      
      // Connect to session-specific WebSocket for real-time updates
      connectToSession(sessionId);
      
      // Set initial recording status
      setRecordingStatus({
        isRecording: true,
        sessionId,
        startTime: new Date().toISOString(),
        duration: 0,
        audioLevel: 0.05,
        errorMessage: null
      });
      
      // Fall back to polling if WebSocket connection fails or times out
      let wsConnected = connectionStatus === 'open';
      if (!wsConnected) {
        // Wait a bit to see if WebSocket connects
        setTimeout(() => {
          if (connectionStatus !== 'open') {
            console.warn('WebSocket connection not established. Falling back to polling.');
            startStatusPolling(sessionId);
          }
        }, 2000);
      }
      
      return sessionId;
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Failed to start recording. Please check your connection and try again.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Helper to start polling for status updates
  const startStatusPolling = (sessionId: string) => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current);
    }
    
    statusPollingRef.current = setInterval(async () => {
      try {
        const statusResponse = await api.audio.getRecordingStatus(sessionId);
        setRecordingStatus(statusResponse.data);
        
        if (!statusResponse.data.isRecording && statusPollingRef.current) {
          clearInterval(statusPollingRef.current);
          statusPollingRef.current = null;
        }
      } catch (err) {
        console.error('Error polling recording status:', err);
        setError('Error getting recording status. Check your connection.');
        
        if (statusPollingRef.current) {
          clearInterval(statusPollingRef.current);
          statusPollingRef.current = null;
        }
      }
    }, 2000); // Poll every 2 seconds
  };

  // Stop recording
  const stopRecording = async (sessionId: string): Promise<boolean> => {
    if (!sessionId) {
      console.error('Attempted to stop recording without a session ID');
      return false;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await api.audio.stopRecording(
        sessionId, 
        settings.autoTranscribe, 
        settings.autoSummarize
      );
      
      // Clear polling interval
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
      
      activeSessionRef.current = null;
      setRecordingStatus(prev => prev?.sessionId === sessionId ? null : prev);
      
      // After recording stops, we should stay connected to the session WebSocket
      // to receive final transcription and summarization updates
      console.log('Recording stopped. WebSocket connection maintained for updates.');
      
      return true;
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError('Failed to stop recording. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Upload audio file
  const uploadAudio = async (file: File, title: string, description?: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await api.audio.uploadAudio(
        file, 
        title, 
        description, 
        settings.autoTranscribe, 
        settings.autoSummarize
      );
      
      return response.data.id;
    } catch (err) {
      console.error('Error uploading audio:', err);
      setError('Failed to upload audio file');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AudioContext.Provider value={{
      devices,
      selectedDevice,
      isLoading,
      error,
      recordingStatus,
      refreshDevices,
      selectDevice,
      startRecording,
      stopRecording,
      getAudioLevel,
      uploadAudio
    }}>
      {children}
    </AudioContext.Provider>
  );
};
