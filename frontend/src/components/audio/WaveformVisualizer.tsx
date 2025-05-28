import React, { useRef, useEffect, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { 
  PlayIcon, 
  PauseIcon, 
  ArrowPathIcon, 
  SpeakerWaveIcon, 
  SpeakerXMarkIcon 
} from '@heroicons/react/24/solid';

interface WaveformVisualizerProps {
  audioUrl: string;
  height?: number;
  waveColor?: string;
  progressColor?: string;
  onPositionChange?: (position: number) => void;
  autoPlay?: boolean;
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  audioUrl,
  height = 80,
  waveColor = '#3B82F6',
  progressColor = '#2563EB',
  regions = [],
  onRegionUpdate,
  onPositionChange,
  showTimeline = true,
  autoPlay = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;
    
    setIsLoading(true);
    setError(null);
    
    const options = {
      container: containerRef.current,
      waveColor,
      progressColor,
      height,
      responsive: true,
      cursorWidth: 2,
      cursorColor: '#64748B',
      normalize: true
    };
    
    wavesurfer.current = WaveSurfer.create(options);
    
    // Load audio
    try {
      wavesurfer.current.load(audioUrl);
    } catch (err) {
      console.error('Error loading audio:', err);
      setError('Failed to load audio file');
      setIsLoading(false);
    }
    
    // Event listeners
    const ws = wavesurfer.current;
    
    ws.on('ready', () => {
      setIsLoading(false);
      setDuration(ws.getDuration());
      ws.setVolume(volume);
      
      if (autoPlay) {
        ws.play();
        setIsPlaying(true);
      }
    });
    
    ws.on('error', (err) => {
      console.error('WaveSurfer error:', err);
      setError('Error processing audio file');
      setIsLoading(false);
    });
    
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    
    ws.on('audioprocess', (pos) => {
      setCurrentTime(pos);
      if (onPositionChange) onPositionChange(pos);
    });
    
    ws.on('seek', (pos) => {
      setCurrentTime(pos * duration);
      if (onPositionChange) onPositionChange(pos * duration);
    });
    
    // Region events

    
    // Cleanup
    return () => {
      if (ws) {
        ws.destroy();
      }
    };
  }, [audioUrl, height, waveColor, progressColor, autoPlay, volume, onPositionChange, duration]);
  
  // Play/pause
  const togglePlayback = useCallback(() => {
    if (!wavesurfer.current) return;
    
    if (isPlaying) {
      wavesurfer.current.pause();
    } else {
      wavesurfer.current.play();
    }
  }, [isPlaying]);
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!wavesurfer.current) return;
    
    if (isMuted) {
      wavesurfer.current.setVolume(volume);
      setIsMuted(false);
    } else {
      wavesurfer.current.setVolume(0);
      setIsMuted(true);
    }
  }, [isMuted, volume]);
  
  // Set volume
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    
    if (wavesurfer.current) {
      wavesurfer.current.setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  }, []);
  
  // Seek to position (exposed for external control if needed)
  const handleSeek = useCallback((time: number) => {
    if (!wavesurfer.current || !duration) return;
    
    const pos = Math.min(Math.max(time, 0), duration);
    wavesurfer.current.seekTo(pos / duration);
  }, [duration]);
  
  return (
    <div className="waveform-visualizer">
      {/* Loading and error states */}
      {isLoading && (
        <div className="flex justify-center items-center h-20 bg-gray-50 dark:bg-dark-700 rounded-md mb-2">
          <ArrowPathIcon className="h-5 w-5 text-primary-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">Loading audio...</span>
        </div>
      )}
      
      {error && (
        <div className="flex justify-center items-center h-20 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-md mb-2">
          <span className="text-sm">{error}</span>
        </div>
      )}
      
      {/* Waveform container */}
      <div 
        ref={containerRef} 
        className={`waveform-container bg-gray-50 dark:bg-dark-700 rounded-t-md ${isLoading ? 'opacity-50' : ''}`}
      />
      

      
      {/* Controls */}
      <div className="flex items-center justify-between p-2 bg-gray-100 dark:bg-dark-600 rounded-b-md">
        <div className="flex items-center space-x-2">
          <button
            onClick={togglePlayback}
            disabled={isLoading}
            className={`p-2 rounded-full ${
              isLoading 
                ? 'text-gray-400 bg-gray-200 dark:text-gray-500 dark:bg-dark-700 cursor-not-allowed'
                : 'text-primary-600 hover:bg-primary-100 dark:text-primary-400 dark:hover:bg-primary-900/30'
            }`}
          >
            {isPlaying ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="h-5 w-5" />
            )}
          </button>
          
          <div className="text-xs font-mono text-gray-600 dark:text-gray-300 min-w-[80px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMute}
            className="p-1 text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400"
          >
            {isMuted ? (
              <SpeakerXMarkIcon className="h-4 w-4" />
            ) : (
              <SpeakerWaveIcon className="h-4 w-4" />
            )}
          </button>
          
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-gray-300 dark:bg-dark-500 rounded-full appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

export default WaveformVisualizer;
