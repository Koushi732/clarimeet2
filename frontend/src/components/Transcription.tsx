import React, { useEffect, useRef, useState } from "react";
import { useSession } from "../contexts/SessionContext";
import { useSettings } from "../hooks/useSettings";
import { useWebSocket } from "../contexts/SimpleWebSocketContext";
import { WebSocketMessage, WebSocketMessageType, MessageTypes } from "../contexts/WebSocketContextBridge";
import styles from "../styles/Transcription.module.css";

interface TranscriptionProps {
  onNewTranscription?: (text: string) => void;
}

const Transcription: React.FC<TranscriptionProps> = ({ onNewTranscription }) => {
  const { currentSession } = useSession();
  const { settings } = useSettings();
  const { status: socketStatus, sendMessage, lastMessage, addMessageHandler } = useWebSocket();
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [connected, setConnected] = useState(socketStatus === 'open');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Update connection status when WebSocket status changes
  useEffect(() => {
    setConnected(socketStatus === 'open');
    console.log(`WebSocket status changed to: ${socketStatus}`);
  }, [socketStatus]);

  // Listen for transcription messages
  useEffect(() => {
    // Process transcription messages from WebSocket context
    const handleMessage = (message: WebSocketMessage) => {
      if (message.type === MessageTypes.TRANSCRIPTION) {
        console.log("Received transcription:", message.data);
        
        // Handle Deepgram transcription format
        if (message.data?.text) {
          // Check if we have speaker data
          const speakerPrefix = message.data.speaker_id 
            ? `[${message.data.speaker_name || 'Speaker ' + message.data.speaker_id}] ` 
            : '';
            
          // Format with speaker and finality
          const formattedText = message.data.is_final 
            ? `${speakerPrefix}${message.data.text} ` // Final transcription
            : `${speakerPrefix}${message.data.text} `; // Interim transcription
            
          // Only add final transcriptions or first interim if empty
          if (message.data.is_final || transcription === "") {
            setTranscription(prev => prev + formattedText);
          } else {
            // Replace the last interim transcription
            setTranscription(prev => {
              // Find the last sentence and replace it
              const sentences = prev.split('. ');
              if (sentences.length > 1) {
                sentences[sentences.length - 1] = formattedText;
                return sentences.join('. ');
              }
              return formattedText; // Just replace everything if it's the first sentence
            });
          }
          
          if (onNewTranscription) {
            onNewTranscription(message.data.text);
          }
        }
      }
    };
    
    // Register message handler
    const removeHandler = addMessageHandler(handleMessage);
    
    // Clean up on unmount
    return () => {
      removeHandler();
    };
  }, [addMessageHandler, onNewTranscription]);

  // Join session when current session changes
  useEffect(() => {
    if (currentSession?.id && socketStatus === 'open') {
      console.log(`Joining session: ${currentSession.id}`);
      sendMessage({
        type: MessageTypes.JOIN_SESSION,
        sessionId: currentSession.id,
      });
    }
  }, [currentSession?.id, socketStatus, sendMessage]);

  // Function to start audio recording
  const startRecording = async () => {
    try {
      console.log("Requesting microphone access...");
      
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      
      streamRef.current = stream;
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Set up event handlers
      mediaRecorder.ondataavailable = handleAudioData;
      
      // Start recording with 500ms intervals
      mediaRecorder.start(500);
      setIsRecording(true);
      console.log("Recording started");
      
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  // Function to stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      // Stop all audio tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      setIsRecording(false);
      console.log("Recording stopped");
    }
  };

  // Handle audio data and send to server with improved error handling
  const handleAudioData = (event: BlobEvent) => {
    if (socketStatus !== 'open') {
      console.warn("WebSocket not connected, cannot send audio");
      return;
    }
    
    if (event.data.size === 0) {
      console.warn("Empty audio chunk received, skipping");
      return;
    }
    
    try {
      console.log(`Sending audio chunk: ${event.data.size} bytes`);
      
      // Check if we need to convert the data format
      // Some Socket.IO implementations work better with base64-encoded data
      const useBase64 = settings?.useBase64AudioEncoding;
      
      if (useBase64) {
        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = (reader.result as string)?.split(',')[1];
          if (base64Audio && socketStatus === 'open') {
            // Send using the WebSocket context
            sendMessage({
              type: MessageTypes.AUDIO_CHUNK,
              data: {
                audio: base64Audio,
                session_id: currentSession?.id,
                timestamp: Date.now(),
                speaker_id: settings.userId || 'anonymous'
              }
            });
          }
        };
        reader.readAsDataURL(event.data);
      } else {
        // Send using the WebSocket context
        sendMessage({
          type: MessageTypes.AUDIO_CHUNK,
          data: event.data
        });
      }
    } catch (error) {
      console.error("Error sending audio data:", error);
    }
  };

  // Toggle recording state
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className={styles.transcriptionContainer}>
      <div className={styles.controlPanel}>
        <button 
          className={`${styles.recordButton} ${isRecording ? styles.recording : ''}`}
          onClick={toggleRecording}
          disabled={!connected}
        >
          {isRecording ? "Stop Recording" : "Start Recording"}
        </button>
        <div className={styles.connectionStatus}>
          Status: {connected ? "Connected" : "Disconnected"}
        </div>
      </div>
      
      <div className={styles.transcriptionOutput}>
        <h3>Live Transcription</h3>
        <div className={styles.transcriptionText}>
          {transcription || "Transcription will appear here..."}
        </div>
      </div>
    </div>
  );
};

export default Transcription;
