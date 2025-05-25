import * as React from 'react';
import { useSettingsContext } from './SettingsContext';

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
  const audioLevelRef = React.useRef<number>(0.05);
  const statusPollingRef = React.useRef<NodeJS.Timeout | null>(null);

  const { settings } = useSettingsContext();

  // Initialize with mock devices on startup
  React.useEffect(() => {
    refreshDevices();
  }, []);

  // Simulated audio level for recordings
  React.useEffect(() => {
    if (recordingStatus?.isRecording) {
      const simulateAudioLevel = setInterval(() => {
        audioLevelRef.current = 0.05 + Math.random() * 0.75;
      }, 100);
      return () => clearInterval(simulateAudioLevel);
    }
  }, [recordingStatus?.isRecording]);

  const refreshDevices = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Always use mock devices for reliability
      console.log('Using mock audio devices');
      const mockDevices: AudioDevice[] = [
        {
          id: 'default-microphone',
          name: 'Default Microphone',
          isInput: true,
          isOutput: false,
          isLoopback: false,
          isDefault: true,
        },
        {
          id: 'system-audio',
          name: 'System Audio (Desktop)',
          isInput: false,
          isOutput: true,
          isLoopback: true,
          isDefault: false,
        },
        {
          id: 'headset-mic',
          name: 'Headset Microphone',
          isInput: true,
          isOutput: false,
          isLoopback: false,
          isDefault: false,
        },
      ];

      setDevices(mockDevices);
      setSelectedDevice(mockDevices[0]);
    } catch (err) {
      console.error('Error setting up audio devices:', err);
      const fallbackDevice: AudioDevice = {
        id: 'fallback-device',
        name: 'Default Audio Input',
        isInput: true,
        isOutput: false,
        isLoopback: false,
        isDefault: true,
      };
      setDevices([fallbackDevice]);
      setSelectedDevice(fallbackDevice);
    } finally {
      setIsLoading(false);
    }
  };

  const selectDevice = (device: AudioDevice) => {
    setSelectedDevice(device);
  };

  const getAudioLevel = React.useCallback(() => {
    return recordingStatus?.isRecording ? audioLevelRef.current : 0;
  }, [recordingStatus?.isRecording]);

  const startRecording = async (title: string, description?: string): Promise<string | null> => {
    if (!selectedDevice) {
      setError('No audio device selected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create a mock recording session
      const sessionId = `session-${Date.now()}`;
      
      // Start simulated recording
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
      
      setRecordingStatus({
        isRecording: true,
        sessionId,
        startTime: new Date().toISOString(),
        duration: 0,
        audioLevel: 0.05,
        errorMessage: null,
      });
      
      // Simulate duration updates
      statusPollingRef.current = setInterval(() => {
        setRecordingStatus(prev => prev ? {
          ...prev,
          duration: prev.duration + 1,
          audioLevel: audioLevelRef.current
        } : null);
      }, 1000);
      
      return sessionId;
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Failed to start recording. Please try again.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const stopRecording = async (sessionId: string): Promise<boolean> => {
    if (!sessionId) {
      setError('No active recording session');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Stop polling for duration updates
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
      
      // Reset recording status
      setRecordingStatus({
        isRecording: false,
        sessionId: null,
        startTime: null,
        duration: 0,
        audioLevel: 0,
        errorMessage: null,
      });

      return true;
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError('Failed to stop recording');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const uploadAudio = async (file: File, title: string, description?: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate file upload with delay
      console.log('Simulating audio upload...');
      const mockSessionId = `upload-${Date.now()}`;
      await new Promise(resolve => setTimeout(resolve, 1500));
      return mockSessionId;
    } catch (err) {
      console.error('Error uploading audio:', err);
      setError('Failed to upload audio file. Please check the file format and try again.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AudioContext.Provider
      value={{
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
        uploadAudio,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};
