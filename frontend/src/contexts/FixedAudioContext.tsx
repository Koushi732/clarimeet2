import * as React from 'react';
import { useSettingsContext } from './SettingsContext';
import { useWebSocketBridge, WebSocketMessageType } from './WebSocketContextBridge';
import axios from 'axios';

// Audio context interfaces
export interface AudioDevice {
  id: string;
  name: string;
  isInput: boolean;
  isOutput: boolean;
  isLoopback: boolean;
  isDefault: boolean;
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

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State variables
  const [devices, setDevices] = React.useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = React.useState<AudioDevice | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = React.useState<RecordingStatus>({
    isRecording: false,
    sessionId: null,
    startTime: null,
    duration: 0,
    audioLevel: 0,
    errorMessage: null
  });
  
  // Refs for audio processing
  const audioLevelRef = React.useRef<number>(0.05);
  const statusPollingRef = React.useRef<NodeJS.Timeout | null>(null);
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

  // Get settings and WebSocket context
  const { settings } = useSettingsContext();
  const webSocketContext = useWebSocketBridge();

  // Clean up audio processing resources
  const cleanupAudioProcessing = React.useCallback(() => {
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
  }, []);

  // Load devices on component mount
  React.useEffect(() => {
    refreshDevices();
    // Clean up any audio resources when component unmounts
    return () => cleanupAudioProcessing();
  }, [cleanupAudioProcessing]);

  // Simulate audio level when recording
  React.useEffect(() => {
    if (recordingStatus.isRecording) {
      const simulateAudioLevel = setInterval(() => {
        audioLevelRef.current = 0.05 + Math.random() * 0.75;
      }, 100);
      return () => clearInterval(simulateAudioLevel);
    }
  }, [recordingStatus.isRecording]);

  // Audio processing callback function
  const onaudioprocess = React.useCallback((event: AudioProcessingEvent) => {
    if (!webSocketStreamingRef.current) return;
    
    try {
      // Get the raw audio data
      const inputBuffer = event.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      
      // Compute RMS (Root Mean Square) for volume level
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      
      const rms = Math.sqrt(sum / inputData.length);
      // Update audio level (scale to 0-1 range)
      audioLevelRef.current = Math.min(1, rms * 5);
      
      // Add to our buffer for processing
      if (!audioBufferRef.current) {
        audioBufferRef.current = new Float32Array(inputData);
      } else {
        // Create a new buffer with existing + new data
        const newBuffer = new Float32Array(audioBufferRef.current.length + inputData.length);
        newBuffer.set(audioBufferRef.current, 0);
        newBuffer.set(inputData, audioBufferRef.current.length);
        audioBufferRef.current = newBuffer;
      }
      
      // Check if we have enough data to send (approximately 0.5 seconds of audio)
      const sampleRate = audioContextRef.current?.sampleRate || 44100;
      if (audioBufferRef.current && audioBufferRef.current.length >= sampleRate / 2) {
        // Convert float32 to int16 for more efficient transmission
        const int16Array = new Int16Array(audioBufferRef.current.length);
        for (let i = 0; i < audioBufferRef.current.length; i++) {
          // Convert from -1.0...1.0 to -32768...32767
          const s = Math.max(-1, Math.min(1, audioBufferRef.current[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Create blob from buffer
        const audioBlob = new Blob([int16Array], { type: 'audio/raw' });
        audioChunksRef.current.push(audioBlob);
        
        // Only send if connected and not too frequent
        const now = Date.now();
        const minInterval = 100; // reduced interval for better real-time performance
        
        if (webSocketContext.connected && 
            (now - lastChunkSentTimeRef.current > minInterval)) {
              
          lastChunkSentTimeRef.current = now;
          
          // Read as array buffer for efficient transfer
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result && webSocketContext.connected) {
              // Create base64 encoded data - using a safer approach for conversion
              let base64data = '';
              if (reader.result instanceof ArrayBuffer) {
                // Convert ArrayBuffer to base64 without using spread operator
                const bytes = new Uint8Array(reader.result);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                base64data = btoa(binary);
              } else {
                base64data = btoa(reader.result as string);
              }
              
              // Send via WebSocket
              webSocketContext.sendMessage({
                type: 'audio_chunk' as WebSocketMessageType,
                data: {
                  sessionId: recordingStatus.sessionId,
                  timestamp: now,
                  audioData: base64data,
                  sampleRate: inputBuffer.sampleRate,
                  format: 'int16',
                  encoding: 'base64',
                  duration: inputData.length / inputBuffer.sampleRate,
                  rms: audioLevelRef.current
                }
              });
            }
          };
          reader.readAsArrayBuffer(audioBlob);
        }
        
        // Reset buffer
        audioBufferRef.current = null;
      }
    } catch (err) {
      console.error('Error processing audio:', err);
    }
  }, [webSocketContext, recordingStatus.sessionId]);

  // Get current audio level
  const getAudioLevel = React.useCallback(() => {
    return recordingStatus.isRecording ? audioLevelRef.current : 0;
  }, [recordingStatus.isRecording]);

  // Refresh available audio devices
  const refreshDevices = React.useCallback(async () => {
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
  }, [selectedDevice]);

  // Select a specific audio device
  const selectDevice = React.useCallback((device: AudioDevice) => {
    setSelectedDevice(device);
  }, []);
  
  // Start recording from the microphone
  const startRecording = React.useCallback(async (title: string, description?: string): Promise<string | null> => {
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
      
      // Get user media
      console.log('Requesting microphone access with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      
      // Create audio context
      console.log('Creating audio context...');
      // Use a fixed sample rate of 16kHz for better compatibility with speech recognition
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({sampleRate: 16000});
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
      
      // If not connected, try to connect
      if (!webSocketContext.connected) {
        console.log('WebSocket not connected, attempting to connect...');
        webSocketContext.reconnect();
        
        // Wait for connection (with timeout)
        const startTime = Date.now();
        const connectionTimeout = 5000; // 5 seconds
        let connectionAttempts = 0;
        
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
          description: description || '',
          timestamp: new Date().toISOString(),
          sampleRate: audioCtx.sampleRate,
          channels: 1,
          format: 'int16',
          deviceName: selectedDevice.name
        }
      });
      
      console.log('Recording start message sent:', messageSent);
      
      // Update recording status
      setRecordingStatus({
        isRecording: true,
        sessionId,
        startTime: new Date().toISOString(),
        duration: 0,
        audioLevel: 0,
        errorMessage: null
      });
      
      // Set up a status polling interval to update duration
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
      
      statusPollingRef.current = setInterval(() => {
        // Update the recording status with current duration
        setRecordingStatus(prev => {
          if (!prev || !prev.isRecording) return prev;
          
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
  }, [devices, onaudioprocess, refreshDevices, selectedDevice, webSocketContext, cleanupAudioProcessing]);

  // Stop recording
  const stopRecording = React.useCallback(async (sessionId: string): Promise<boolean> => {
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
    if (!recordingStatus.isRecording) {
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
  }, [recordingStatus.isRecording, cleanupAudioProcessing]);

  // Upload an audio file
  const uploadAudio = React.useCallback(async (file: File, title: string, description?: string): Promise<string | null> => {
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
  }, []);

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

// Re-export the context for direct usage
export { AudioContext };
