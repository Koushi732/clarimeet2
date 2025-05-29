import * as React from 'react';
import { useSettingsContext } from './SettingsContext';
import { useWebSocketBridge, WebSocketMessageType } from './WebSocketContextBridge';
import axios from 'axios';

// Audio context interfaces

// Define interfaces for audio context
export interface AudioDevice {
  id: string;
  name: string;
  isInput: boolean;
  isOutput: boolean;
  isLoopback: boolean;
  isDefault: boolean;
  // Additional properties for Web Audio API
  deviceId?: string;
  groupId?: string;
  kind?: MediaDeviceKind;
  label?: string;
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
  
  // Audio processing references
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const sourceNodeRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = React.useRef<ScriptProcessorNode | null>(null);
  const audioBufferRef = React.useRef<Float32Array | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const webSocketStreamingRef = React.useRef<boolean>(false);
  const lastChunkSentTimeRef = React.useRef<number>(0);
  const lastReconnectAttemptRef = React.useRef<number>(0);

  const { settings } = useSettingsContext();
  // Get the WebSocket context for audio streaming
  const webSocketContext = useWebSocketBridge();

  // Initialize with devices on startup
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
      // Check if browser supports mediaDevices API
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        // Request permission to access audio devices
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Get available media devices
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = mediaDevices.filter(device => device.kind === 'audioinput');
        
        // Transform to our AudioDevice interface
        const formattedDevices: AudioDevice[] = audioDevices.map(device => {
          const isDefault = device.deviceId === 'default' || device.deviceId === '';
          const isLoopback = device.label.toLowerCase().includes('loopback') || 
                            device.label.toLowerCase().includes('stereo mix');
          
          return {
            id: device.deviceId || `device-${Date.now()}`,
            name: device.label || (isDefault ? 'Default Microphone' : `Microphone ${device.deviceId.substring(0, 5)}`),
            isInput: true,
            isOutput: false,
            isLoopback,
            isDefault,
            deviceId: device.deviceId,
            groupId: device.groupId,
            kind: device.kind,
            label: device.label
          };
        });
        
        console.log('Found audio devices:', formattedDevices);
        setDevices(formattedDevices);
        
        // Auto-select default device if none is selected
        if (!selectedDevice && formattedDevices.length > 0) {
          const defaultDevice = formattedDevices.find(d => d.isDefault) || formattedDevices[0];
          setSelectedDevice(defaultDevice);
          console.log('Auto-selected device:', defaultDevice.name);
        }
      } else {
        throw new Error('Browser does not support mediaDevices API');
      }
    } catch (err) {
      console.error('Error refreshing devices:', err);
      setError('Failed to access microphone. Please check your permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectDevice = (device: AudioDevice) => {
    setSelectedDevice(device);
  };

  // Audio processing callback
  const onaudioprocess = (event: AudioProcessingEvent) => {
    if (!webSocketStreamingRef.current) return;
    
    try {
      // Get audio data from the buffer
      const inputBuffer = event.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      
      // Calculate audio level (RMS)
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      audioLevelRef.current = Math.min(1, rms * 5); // Scale up for better visualization
      
      // Skip silent frames - improves efficiency and reduces unnecessary network traffic
      const isSilent = audioLevelRef.current < 0.01;
      if (isSilent) {
        // Send a silent frame only occasionally to keep the connection alive
        const timeSinceLastChunk = Date.now() - lastChunkSentTimeRef.current;
        if (timeSinceLastChunk < 5000) {  // 5 seconds
          return;
        }
      }
      
      // Check if we need to reconnect WebSocket (if more than 30 seconds since last successful transmission)
      const timeSinceLastSend = Date.now() - lastChunkSentTimeRef.current;
      const timeSinceLastReconnect = Date.now() - lastReconnectAttemptRef.current;
      
      if (timeSinceLastSend > 30000 && timeSinceLastReconnect > 60000 && !webSocketContext.connected) {
        console.log('WebSocket seems disconnected. Attempting to reconnect...');
        webSocketContext.reconnect();
        lastReconnectAttemptRef.current = Date.now();
      }
      
      // Skip if WebSocket is not connected
      if (!webSocketContext.connected || !recordingStatus?.sessionId) {
        return;
      }
      
      // Convert Float32Array to Int16Array for more efficient transmission
      // Speech recognition typically uses 16-bit PCM
      const audioFloat32 = new Float32Array(inputData);
      const audioInt16 = new Int16Array(audioFloat32.length);
      
      // Convert float values (-1.0 to 1.0) to int16 values (-32768 to 32767)
      for (let i = 0; i < audioFloat32.length; i++) {
        const s = Math.max(-1, Math.min(1, audioFloat32[i]));
        audioInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Convert to Base64 for transmission over WebSocket
      const audioBlob = new Blob([audioInt16.buffer], { type: 'audio/pcm' });
      const reader = new FileReader();
      
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        
        // Send audio chunk through WebSocket
        const success = webSocketContext.sendMessage({
          type: 'audio_chunk' as WebSocketMessageType,
          data: {
            sessionId: recordingStatus.sessionId,
            timestamp: Date.now(),
            audioData: base64data,
            sampleRate: inputBuffer.sampleRate,
            format: 'int16',
            encoding: 'base64',
            duration: inputData.length / inputBuffer.sampleRate,
            rms: audioLevelRef.current
          }
        });
        
        if (success) {
          lastChunkSentTimeRef.current = Date.now();
        }
      };
      
      reader.readAsDataURL(audioBlob);
      
    } catch (err) {
      console.error('Error processing audio:', err);
    }
  };

  // Clean up audio processing resources
  const cleanupAudioProcessing = () => {
    console.log('Cleaning up audio processing resources...');
    
    // Stop any active audio stream
    if (mediaStreamRef.current) {
      const tracks = mediaStreamRef.current.getTracks();
      tracks.forEach(track => {
        console.log(`Stopping audio track: ${track.kind}/${track.label}`);
        track.stop();
      });
      mediaStreamRef.current = null;
    }
    
    // Disconnect the audio processing graph
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
        console.log('Disconnected source node');
      } catch (err) {
        console.warn('Error disconnecting source node:', err);
      }
      sourceNodeRef.current = null;
    }
    
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
        console.log('Disconnected analyser node');
      } catch (err) {
        console.warn('Error disconnecting analyser node:', err);
      }
      analyserRef.current = null;
    }
    
    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.disconnect();
        console.log('Disconnected processor node');
      } catch (err) {
        console.warn('Error disconnecting processor node:', err);
      }
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
          console.log('Closed audio context');
        } catch (err) {
          console.warn('Error closing audio context:', err);
        }
      }
      audioContextRef.current = null;
    }
    
    // Clear other references
    audioBufferRef.current = null;
    audioChunksRef.current = [];
    webSocketStreamingRef.current = false;
    
    console.log('Audio processing resources cleaned up');
  };

  const getAudioLevel = React.useCallback(() => {
    return recordingStatus?.isRecording ? audioLevelRef.current : 0;
  }, [recordingStatus?.isRecording]);
  
  const startRecording = async (title: string, description?: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    
    // Generate a new session ID for this recording
    const sessionId = `rec-${Date.now()}`;
    console.log(`Starting recording with session ID: ${sessionId}`);
    
    try {
      // Get selected device or default
      if (!selectedDevice) {
        console.warn('No audio device selected, attempting to use default');
        await refreshDevices();
        
        // If we still don't have a device, show error and abort
        if (devices.length === 0) {
          throw new Error('No audio devices available');
        }
        
        // Find default input device
        const defaultDevice = devices.find(d => d.isInput && d.isDefault);
        if (!defaultDevice) {
          throw new Error('No default input device found');
        }
        
        // Auto-select default device
        setSelectedDevice(defaultDevice);
        console.log(`Auto-selected default device: ${defaultDevice.name}`);
      }
      
      console.log(`Using audio device: ${selectedDevice.name}`);
      
      // Request access to the microphone
      const constraints = {
        audio: {
          deviceId: selectedDevice.deviceId ? { exact: selectedDevice.deviceId } : undefined,
          echoCancellation: !selectedDevice.isLoopback,
          noiseSuppression: !selectedDevice.isLoopback,
          autoGainControl: !selectedDevice.isLoopback
        }
      };
      
      try {
        // Get user media
        console.log('Requesting microphone access with constraints:', constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;
        
        // Create audio context
        console.log('Creating audio context...');
        // Use a fixed sample rate of 16kHz for better compatibility with speech recognition
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
        audioContextRef.current = audioCtx;
        
        // Create analyser for audio levels
        console.log('Setting up audio analyser...');
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyserRef.current = analyser;
        
        // Create a buffer for the audio level data
        const dataArray = new Float32Array(analyser.fftSize);
        audioBufferRef.current = dataArray;
        
        // Check WebSocket connection status
        console.log('Checking WebSocket connection...');
        let connectionAttempts = 0;
        
        // If not connected, try to connect
        if (!webSocketContext.connected) {
          console.log('WebSocket not connected, attempting to connect...');
          webSocketContext.reconnect();
          
          // Wait for connection (with timeout)
          const startTime = Date.now();
          const connectionTimeout = 5000; // 5 seconds
          
          while (!webSocketContext.connected && Date.now() - startTime < connectionTimeout) {
            console.log('Waiting for WebSocket connection...');
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 500ms
            connectionAttempts++;
            
            // Try to reconnect explicitly
            if (connectionAttempts % 3 === 0) {
              console.log('Still not connected, explicitly trying to reconnect...');
              webSocketContext.reconnect();
            }
          }
        }
        
        // Final check - ensure connection is ready
        if (!webSocketContext.connected) {
          console.warn('WebSocket connection could not be established. Audio streaming may not work.');
          console.log('Will proceed with recording anyway. Please check network connectivity.');
        } else {
          console.log('WebSocket connected and ready to send audio data');
        }
        
        // Connect audio graph
        const source = audioCtx.createMediaStreamSource(stream);
        sourceNodeRef.current = source;
        
        // Create script processor for raw audio data - use a smaller buffer size for more frequent updates
        const processor = audioCtx.createScriptProcessor(2048, 1, 1);
        processorNodeRef.current = processor;
        
        console.log('Created audio processor with buffer size:', processor.bufferSize);
        
        // Connect the audio graph
        source.connect(analyser);
        analyser.connect(processor);
        processor.connect(audioCtx.destination);
        
        // Log success of audio pipeline setup
        console.log('Audio processing pipeline successfully connected');
        
        // Initialize WebSocket streaming
        webSocketStreamingRef.current = true;
        
        // Set up processing callback
        processor.onaudioprocess = onaudioprocess;
        
        console.log('Audio processing initialized with sample rate:', audioCtx.sampleRate);
        
        // Connect to session via WebSocket
        console.log('Connecting to session via WebSocket...');
        webSocketContext.connectToSession(sessionId);
        
        // Send initial recording start message
        const messageSent = webSocketContext.sendMessage({
          type: 'recording_start' as WebSocketMessageType,
          data: {
            sessionId: sessionId,
            title: title,
            description: description,
            sampleRate: audioCtx.sampleRate,
            deviceInfo: {
              name: selectedDevice.name,
              isLoopback: selectedDevice.isLoopback
            }
          }
        });
        
        if (!messageSent) {
          console.warn('Failed to send recording_start message. Audio streaming may not work properly.');
        } else {
          console.log('Successfully sent recording_start message');
        }
      } catch (err) {
        console.error('Error accessing microphone:', err);
        setError('Failed to access microphone. Please check your permissions.');
        cleanupAudioProcessing();
        return null;
      }
      
      // Start recording status updates
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
    
      setRecordingStatus({
        isRecording: true,
        sessionId: sessionId,
        startTime: new Date().toISOString(),
        duration: 0,
        audioLevel: 0.05,
        errorMessage: null,
      });
    
      // Update duration
      statusPollingRef.current = setInterval(() => {
        // Use ref to prevent unnecessary re-renders
        if (recordingStatus) {
          setRecordingStatus(prev => {
            if (!prev) return null;
            // Only update if values actually changed
            if (prev.duration + 1 === prev.duration && prev.audioLevel === audioLevelRef.current) {
              return prev; // No change
            }
            return {
              ...prev,
              duration: prev.duration + 1,
              audioLevel: audioLevelRef.current
            };
          });
        }
      }, 1000);
      
      return sessionId;
    } catch (err: any) {
      console.error('Error starting recording:', err);
      setError('Failed to start recording. Please try again.');
      cleanupAudioProcessing();
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const stopRecording = async (sessionId: string): Promise<boolean> => {
    // Handle special reset case
    if (sessionId === 'reset-phantom-recording') {
      console.log('Resetting phantom recording state');
      
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
      
      cleanupAudioProcessing();
      
      setRecordingStatus({
        isRecording: false,
        sessionId: null,
        startTime: null,
        duration: 0,
        audioLevel: 0,
        errorMessage: null,
      });
      
      return true;
    }
    
    // Normal case - stopping an actual recording
    if (!sessionId) {
      console.warn('No active recording session ID provided');
      setError('No active recording session');
      return false;
    }

    // Check if recording is active
    if (!recordingStatus?.isRecording) {
      console.warn('No active recording to stop');
      return false;
    }

    console.log(`Stopping recording for session ${sessionId}`);
    setIsLoading(true);
    setError(null);

    try {
      // Stop WebSocket streaming
      webSocketStreamingRef.current = false;
      
      // Clean up audio processing
      cleanupAudioProcessing();
      
      // Clean up any status polling
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
      
      // Tell backend to stop transcription
      try {
        await axios.post(`/api/transcription/${sessionId}/stop`);
        console.log('Successfully stopped transcription on backend');
      } catch (apiError) {
        console.error('Error stopping transcription on backend:', apiError);
        // Continue with cleanup even if API call fails
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
    } catch (err: any) {
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
    } catch (err: any) {
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
