import * as React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAudio } from '../contexts/AudioContext';
import { useSession } from '../contexts/SessionContext';
import { useSettingsContext } from '../contexts/SettingsContext';
import { useWebSocketBridge, WebSocketMessageType, WebSocketMessage } from '../contexts/WebSocketContextBridge';
import AudioVisualizer from '../components/ui/AudioVisualizer';
import { createEnhancedMiniTab, createMiniTab, isElectron } from '../utils/electronBridge';
// Icons
import {
  MicrophoneIcon,
  StopIcon,
  PauseIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChartBarIcon as WaveformIcon, // Using ChartBarIcon as a replacement for WaveformIcon
} from '@heroicons/react/24/solid';

const { useState, useEffect, useRef, useCallback } = React;

const LivePage = (): React.ReactElement => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  
  const { 
    devices, 
    selectedDevice, 
    selectDevice, 
    refreshDevices, 
    isLoading: audioLoading, 
    error: audioError,
    recordingStatus,
    startRecording,
    stopRecording
  } = useAudio();
  
  const {
    setActiveSession,
    currentSession,
    isLoading: sessionLoading,
    error: sessionError
  } = useSession();
  
  // Load devices on component mount and check for auto-start flag
  useEffect(() => {
    refreshDevices();
    
    // Check if we should auto-start recording (when coming from homepage button)
    const shouldAutoStart = localStorage.getItem('start-recording-immediately') === 'true';
    if (shouldAutoStart) {
      // Clear the flag
      localStorage.removeItem('start-recording-immediately');
      
      // Wait a brief moment for devices to load
      setTimeout(() => {
        handleStartRecording();
      }, 500);
    }
  }, []);
  
  // Start recording handler
  const handleStartRecording = async () => {
    // Use a default title if not provided
    const recordingTitle = title.trim() || `Meeting Recording ${new Date().toLocaleString()}`;
    
    // Use first available device if none selected
    if (!selectedDevice && devices.length > 0) {
      // Prefer loopback devices for system audio capture
      const loopbackDevice = devices.find(d => d.isLoopback);
      const defaultDevice = devices.find(d => d.isDefault);
      selectDevice(loopbackDevice || defaultDevice || devices[0]);
    }
    
    if (!selectedDevice && devices.length === 0) {
      alert('No audio devices available. Please check your audio settings.');
      return;
    }
    
    setIsStarting(true);
    
    try {
      const sessionId = await startRecording(recordingTitle, description);
      
      if (sessionId) {
        // If we have a session ID, the recording started successfully
        console.log(`Recording started with session ID: ${sessionId}`);
        
        // Always show MiniTab when recording starts
        if (isElectron()) {
          // Position at the top-right corner of the screen
          const screenWidth = window.screen.width;
          // First try to create the MiniTab
          createMiniTab({
            x: screenWidth - 320,
            y: 50,
            width: 300,
            height: 150
          });
          
          // Then create the enhanced version with more panels
          createEnhancedMiniTab({
            x: screenWidth - 370,
            y: 100,
            width: 320,
            height: 420
          });
        }
      }
    } catch (error) {
      console.error('Error starting recording:', error);
    } finally {
      setIsStarting(false);
    }
  };
  
  // Stop recording handler
  const handleStopRecording = async () => {
    if (!currentSession?.session?.id) {
      console.error('No active session to stop');
      return;
    }
    
    setIsStopping(true);
    
    try {
      const success = await stopRecording(currentSession.session.id);
      
      if (success) {
        console.log('Recording stopped successfully');
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    } finally {
      setIsStopping(false);
    }
  };
  
  // WebSocket integration for real-time updates
  const { sendMessage, lastMessage, connectionStatus } = useWebSocketBridge();
  const { settings } = useSettingsContext();
  const navigate = useNavigate();
  
  // Define types for transcription data
  interface Transcription {
    id: string;
    text: string;
    timestamp: number;
    speaker?: string;
    confidence?: number;
  }
  
  // Audio level state for smoother animation
  const [smoothedAudioLevel, setSmoothedAudioLevel] = useState<number>(0);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  
  // Define WebSocket message types
  interface WebSocketMessage {
    type: string;
    [key: string]: any;
  }
  
  interface TranscriptionMessage extends WebSocketMessage {
    type: 'transcription';
    data: Transcription;
  }
  
  interface RecordingCompleteMessage extends WebSocketMessage {
    type: 'recording_complete';
    sessionId: string;
  }
  
  // Process WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      const data = JSON.parse(lastMessage.data) as WebSocketMessage;
      
      if (data.type === 'transcription') {
        const transcriptionMsg = data as TranscriptionMessage;
        setTranscriptions((prev: Transcription[]) => [...prev, transcriptionMsg.data]);
      }
      
      if (data.type === 'recording_complete') {
        const completeMsg = data as RecordingCompleteMessage;
        console.log('Recording completed, session ID:', completeMsg.sessionId);
        if (completeMsg.sessionId && settings.autoSummarize) {
          navigate(`/summary/${completeMsg.sessionId}`);
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [lastMessage, navigate, settings.autoSummarize]);
  
  // Smooth audio level animation
  useEffect(() => {
    const level = recordingStatus?.audioLevel || 0;
    setSmoothedAudioLevel(prev => {
      const delta = level - prev;
      return prev + delta * 0.3; // Smooth transition
    });
  }, [recordingStatus?.audioLevel]);
  
  // Send heartbeat to keep WebSocket connection alive
  useEffect(() => {
    if (recordingStatus?.isRecording && connectionStatus === 'Connected') {
      const interval = setInterval(() => {
        sendMessage(JSON.stringify({ type: 'heartbeat' }));
      }, 30000); // Every 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [recordingStatus?.isRecording, connectionStatus, sendMessage]);

  // Navigate to summary page after stopping recording
  useEffect(() => {
    if (currentSession?.session?.id && 
        !recordingStatus?.isRecording && 
        currentSession?.transcriptionStatus?.status === 'completed' &&
        currentSession?.summarizationStatus?.status === 'completed') {
      // Add a delay to ensure backend processing is complete
      const timer = setTimeout(() => {
        navigate(`/summary/${currentSession.session.id}`);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [recordingStatus?.isRecording, currentSession, navigate]);
  
  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Live Recording
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Record, transcribe, and summarize your meetings in real-time
        </p>
      </motion.div>

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Recording controls */}
        <div className="md:col-span-2">
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">
              {recordingStatus?.isRecording ? 'Currently Recording' : 'Start a New Recording'}
            </h2>
            
            {!recordingStatus?.isRecording && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="label">
                    Recording Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    className="input"
                    placeholder="E.g., Team Meeting - May 25, 2025"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={recordingStatus?.isRecording}
                  />
                </div>
                
                <div>
                  <label htmlFor="description" className="label">
                    Description (Optional)
                  </label>
                  <textarea
                    id="description"
                    className="input"
                    placeholder="Brief description of this recording"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={recordingStatus?.isRecording}
                  />
                </div>
                
                <div>
                  <label className="label">Audio Source</label>
                  <div className="flex justify-between items-center">
                    <select
                      className="input"
                      value={selectedDevice?.id || ''}
                      onChange={(e) => {
                        const device = devices.find(d => d.id === e.target.value);
                        if (device) selectDevice(device);
                      }}
                      disabled={recordingStatus?.isRecording || audioLoading}
                    >
                      <option value="">Select an audio source</option>
                      <optgroup label="System Audio (Recommended)">
                        {devices
                          .filter(device => device.isLoopback)
                          .map(device => (
                            <option key={device.id} value={device.id}>
                              {device.name}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Microphones">
                        {devices
                          .filter(device => device.isInput && !device.isLoopback)
                          .map(device => (
                            <option key={device.id} value={device.id}>
                              {device.name}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                    
                    <button
                      onClick={refreshDevices}
                      className="ml-2 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      disabled={audioLoading}
                    >
                      <ArrowPathIcon className={`h-5 w-5 ${audioLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  
                  {audioError && (
                    <p className="text-red-500 text-sm mt-1">{audioError}</p>
                  )}
                </div>
                
                <div className="pt-4">
                  <button
                    onClick={handleStartRecording}
                    disabled={!selectedDevice || !title.trim() || isStarting || audioLoading}
                    className="btn btn-primary w-full flex items-center justify-center"
                  >
                    {isStarting ? (
                      <>
                        <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <MicrophoneIcon className="h-5 w-5 mr-2" />
                        Start Recording
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {recordingStatus?.isRecording && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    {description && <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>}
                  </div>
                  
                  <div className="text-2xl font-mono bg-gray-100 dark:bg-dark-700 px-3 py-1 rounded">
                    {formatTime(recordingStatus.duration)}
                  </div>
                </div>
                
                {/* Audio visualization */}
                <div className="mt-4">
                  <AudioVisualizer 
                    audioLevel={smoothedAudioLevel} 
                    isRecording={recordingStatus?.isRecording || false}
                    height={80}
                    barCount={30}
                    className="w-full"
                  />
                </div>
                
                <div className="pt-4 flex justify-end space-x-4">
                  <button
                    onClick={handleStopRecording}
                    disabled={isStopping}
                    className="btn bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
                  >
                    {isStopping ? (
                      <>
                        <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                        Stopping...
                      </>
                    ) : (
                      <>
                        <StopIcon className="h-5 w-5 mr-2" />
                        Stop Recording
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Status and info */}
        <div>
          <div className="card p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Recording Status</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <MicrophoneIcon className={`h-5 w-5 mr-2 ${recordingStatus?.isRecording ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
                  <span>Recording</span>
                </div>
                <span className={`text-sm font-medium ${recordingStatus?.isRecording ? 'text-red-500' : 'text-gray-500'}`}>
                  {recordingStatus?.isRecording ? 'Active' : 'Inactive'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <WaveformIcon className={`h-5 w-5 mr-2 ${currentSession?.transcriptionStatus?.status === 'transcribing' ? 'text-yellow-500 animate-pulse' : 'text-gray-400'}`} />
                  <span>Transcription</span>
                </div>
                <span className={`text-sm font-medium ${
                  currentSession?.transcriptionStatus?.status === 'transcribing' 
                    ? 'text-yellow-500' 
                    : currentSession?.transcriptionStatus?.status === 'completed'
                    ? 'text-green-500'
                    : 'text-gray-500'
                }`}>
                  {currentSession?.transcriptionStatus?.status || 'Not Started'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CheckCircleIcon className={`h-5 w-5 mr-2 ${currentSession?.summarizationStatus?.status === 'running' ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`} />
                  <span>Summarization</span>
                </div>
                <span className={`text-sm font-medium ${
                  currentSession?.summarizationStatus?.status === 'running' 
                    ? 'text-blue-500' 
                    : currentSession?.summarizationStatus?.status === 'completed'
                    ? 'text-green-500'
                    : 'text-gray-500'
                }`}>
                  {currentSession?.summarizationStatus?.status || 'Not Started'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Recording Tips</h2>
            
            <ul className="space-y-2 text-gray-600 dark:text-gray-300">
              <li className="flex items-start">
                <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>For best results, select a system audio source to capture your meeting audio.</span>
              </li>
              <li className="flex items-start">
                <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>Transcription and summarization happen automatically while recording.</span>
              </li>
              <li className="flex items-start">
                <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>You can view real-time results in the floating panels or the Summary tab.</span>
              </li>
              <li className="flex items-start">
                <ExclamationCircleIcon className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>Stopping the recording will finalize the session but continue processing.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Live transcription */}
      {currentSession?.currentTranscriptions && currentSession.currentTranscriptions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Live Transcription</h2>
          
          <div className="card p-6 max-h-96 overflow-y-auto">
            {currentSession.currentTranscriptions.map((transcription, index) => (
              <div key={transcription.id} className="mb-4 last:mb-0">
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-mono">{formatTime(transcription.timestamp)}</span>
                  {transcription.speaker && (
                    <span className="ml-2 bg-gray-100 dark:bg-dark-600 px-2 py-0.5 rounded">
                      {transcription.speaker}
                    </span>
                  )}
                </div>
                <p className="text-gray-800 dark:text-gray-200">{transcription.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LivePage;
