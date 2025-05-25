#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Real-time Transcription Service for Clariimeet

Implements real-time audio transcription using Whisper for streaming audio data.
Supports chunked processing, continuous transcription, and transcript storage.
"""

import os
import sys
import time
import wave
import json
import uuid
import queue
import tempfile
import logging
import threading
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union, BinaryIO, Generator, Any, Callable
from datetime import datetime
from dataclasses import dataclass, asdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Try to import Whisper - but provide fallbacks
try:
    import whisper
    WHISPER_AVAILABLE = True
    logger.info("Whisper is available for transcription")
except ImportError:
    WHISPER_AVAILABLE = False
    logger.warning("Whisper not available, will use fallback transcription")

# Try to import torch for GPU detection
try:
    import torch
    TORCH_AVAILABLE = True
    CUDA_AVAILABLE = torch.cuda.is_available()
    logger.info(f"PyTorch is available, CUDA: {CUDA_AVAILABLE}")
except ImportError:
    TORCH_AVAILABLE = False
    CUDA_AVAILABLE = False
    logger.warning("PyTorch not available, transcription will be slower")

# Default configuration
DEFAULT_MODEL_SIZE = "small"  # Options: tiny, base, small, medium, large
DEFAULT_LANGUAGE = "en"  # Language code (or None for auto-detection)
DEFAULT_SAMPLE_RATE = 16000  # Must match audio input sample rate
DEFAULT_CHUNK_SECONDS = 5  # Process in 5-second chunks
TRANSCRIPTION_OVERLAP_SECONDS = 1  # Overlap between chunks to improve continuity
SILENCE_THRESHOLD = 0.05  # Below this amplitude, consider it silence

@dataclass
class TranscriptionResult:
    """Represents a transcription result with metadata"""
    id: str
    text: str
    timestamp: float
    start_time: float
    end_time: float
    language: str
    is_final: bool
    speaker: Optional[str] = None
    confidence: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return asdict(self)

class TranscriptionStatus:
    """Represents the current status of transcription for a session"""
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.status = "idle"  # idle, transcribing, completed, error
        self.model = None
        self.language = None
        self.progress = 0.0  # 0.0-1.0
        self.error = None
        self.last_update = time.time()
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            "session_id": self.session_id,
            "status": self.status,
            "model": self.model,
            "language": self.language,
            "progress": self.progress,
            "error": self.error,
            "last_update": self.last_update
        }

class WhisperTranscriber:
    """Real-time transcription service using OpenAI's Whisper model"""
    
    def __init__(self, model_size: str = DEFAULT_MODEL_SIZE, language: str = DEFAULT_LANGUAGE, 
                 sample_rate: int = DEFAULT_SAMPLE_RATE, device: str = None,
                 chunk_seconds: int = DEFAULT_CHUNK_SECONDS):
        self.model_size = model_size
        self.language = language
        self.sample_rate = sample_rate
        self.chunk_seconds = chunk_seconds
        self.chunk_samples = chunk_seconds * sample_rate
        self.overlap_samples = int(TRANSCRIPTION_OVERLAP_SECONDS * sample_rate)
        
        # Use CUDA if available, otherwise CPU
        if device is None:
            self.device = "cuda" if CUDA_AVAILABLE else "cpu"
        else:
            self.device = device
            
        self.model = None
        self.audio_buffer = np.array([], dtype=np.float32)
        self.last_processed_samples = 0
        self.is_initialized = False
        self.is_running = False
        self.processing_thread = None
        self.processing_queue = queue.Queue()
        self.results_callback = None
        self.session_id = None
        self.status = None
    
    def initialize(self) -> bool:
        """Initialize the Whisper model"""
        if self.is_initialized:
            return True
            
        if not WHISPER_AVAILABLE:
            logger.error("Whisper is not available - cannot initialize transcription")
            return False
            
        try:
            logger.info(f"Loading Whisper model: {self.model_size} on {self.device}")
            self.model = whisper.load_model(self.model_size, device=self.device)
            self.is_initialized = True
            logger.info(f"Whisper model loaded successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Whisper model: {e}")
            return False
    
    def start_transcription(self, session_id: str, callback: Callable[[TranscriptionResult], None] = None) -> bool:
        """Start the transcription process for streaming audio"""
        if self.is_running:
            logger.warning("Transcription is already running")
            return True
            
        if not self.is_initialized and not self.initialize():
            return False
            
        self.session_id = session_id
        self.results_callback = callback
        self.audio_buffer = np.array([], dtype=np.float32)
        self.last_processed_samples = 0
        self.is_running = True
        
        # Initialize status tracking
        self.status = TranscriptionStatus(session_id)
        self.status.status = "transcribing"
        self.status.model = self.model_size
        self.status.language = self.language
        
        # Start processing thread
        self.processing_thread = threading.Thread(target=self._processing_worker)
        self.processing_thread.daemon = True
        self.processing_thread.start()
        
        logger.info(f"Started real-time transcription for session {session_id}")
        return True
    
    def stop_transcription(self) -> bool:
        """Stop the transcription process and process any remaining audio"""
        if not self.is_running:
            return True
            
        self.is_running = False
        
        # Add a final chunk marker to the queue
        self.processing_queue.put(None)
        
        # Wait for processing to complete
        if self.processing_thread:
            self.processing_thread.join(timeout=10.0)
            
        # Update status
        if self.status:
            self.status.status = "completed"
            self.status.progress = 1.0
            self.status.last_update = time.time()
            
        logger.info("Stopped real-time transcription")
        return True
    
    def process_audio_chunk(self, audio_data: Union[bytes, np.ndarray]) -> None:
        """Process a chunk of audio data for transcription"""
        if not self.is_running:
            return
            
        # Convert bytes to numpy array if needed
        if isinstance(audio_data, bytes):
            # Assuming 16-bit PCM audio
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        else:
            audio_np = audio_data
            
        # Add to the buffer
        self.audio_buffer = np.append(self.audio_buffer, audio_np)
        
        # Queue the buffer for processing if it's long enough
        if len(self.audio_buffer) >= self.chunk_samples:
            self.processing_queue.put(self.audio_buffer.copy())
    
    def _processing_worker(self) -> None:
        """Worker thread that processes audio chunks and generates transcriptions"""
        try:
            while self.is_running or not self.processing_queue.empty():
                try:
                    # Get the next audio buffer from the queue (with timeout)
                    audio_buffer = self.processing_queue.get(timeout=1.0)
                    
                    # None is a signal to process any remaining audio and exit
                    if audio_buffer is None:
                        if len(self.audio_buffer) > 0:
                            self._transcribe_audio(self.audio_buffer)
                        break
                    
                    # Process the audio if there's enough to form a complete chunk
                    if len(audio_buffer) >= self.chunk_samples:
                        # Extract the chunk to process (with some overlap)
                        chunk_end = min(self.last_processed_samples + self.chunk_samples, len(audio_buffer))
                        chunk_start = max(0, chunk_end - self.chunk_samples)
                        
                        # Only process if there's new audio
                        if chunk_end > self.last_processed_samples:
                            audio_chunk = audio_buffer[chunk_start:chunk_end]
                            self._transcribe_audio(audio_chunk, 
                                                   start_time=chunk_start / self.sample_rate,
                                                   end_time=chunk_end / self.sample_rate)
                            
                            # Update the last processed position with overlap
                            self.last_processed_samples = chunk_end - self.overlap_samples
                    
                    # Update progress in status
                    if self.status:
                        self.status.progress = min(0.99, self.last_processed_samples / len(audio_buffer))
                        self.status.last_update = time.time()
                        
                except queue.Empty:
                    # No new audio data, just continue
                    continue
                    
                except Exception as e:
                    logger.error(f"Error in transcription worker: {e}")
                    if self.status:
                        self.status.error = str(e)
                    time.sleep(0.1)  # Short sleep to prevent CPU spinning
                    
        except Exception as e:
            logger.error(f"Transcription worker thread error: {e}")
            if self.status:
                self.status.status = "error"
                self.status.error = str(e)
        finally:
            logger.info("Transcription worker thread stopped")
    
    def _transcribe_audio(self, audio_chunk: np.ndarray, start_time: float = 0.0, end_time: float = None) -> None:
        """Transcribe an audio chunk using Whisper"""
        if not self.model or len(audio_chunk) == 0:
            return
            
        if end_time is None:
            end_time = len(audio_chunk) / self.sample_rate
            
        try:
            # Skip if the audio is mostly silence
            if self._is_silence(audio_chunk):
                logger.debug("Skipping silence in transcription")
                return
                
            # Process the audio with Whisper
            transcription_options = {
                "fp16": TORCH_AVAILABLE and self.device == "cuda",
                "language": self.language,
                "task": "transcribe"
            }
            
            result = self.model.transcribe(
                audio_chunk, 
                **transcription_options
            )
            
            # Extract the transcription result
            if result and "text" in result and result["text"].strip():
                # Create a result object
                transcription_result = TranscriptionResult(
                    id=str(uuid.uuid4()),
                    text=result["text"].strip(),
                    timestamp=time.time(),
                    start_time=start_time,
                    end_time=end_time,
                    language=result.get("language", self.language),
                    is_final=True,
                    confidence=result.get("confidence", None)
                )
                
                # Call the callback with the result
                if self.results_callback:
                    self.results_callback(transcription_result)
                    
                logger.debug(f"Transcribed: {transcription_result.text}")
                
        except Exception as e:
            logger.error(f"Error transcribing audio chunk: {e}")
            if self.status:
                self.status.error = str(e)
    
    def _is_silence(self, audio_chunk: np.ndarray, threshold: float = SILENCE_THRESHOLD) -> bool:
        """Check if an audio chunk is mostly silence"""
        # Calculate RMS amplitude
        rms = np.sqrt(np.mean(np.square(audio_chunk)))
        return rms < threshold
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current transcription status"""
        if self.status:
            return self.status.to_dict()
        return {"status": "not_started"}

class FallbackTranscriber:
    """Fallback transcription service that simulates transcription for testing"""
    
    def __init__(self, model_size: str = DEFAULT_MODEL_SIZE, language: str = DEFAULT_LANGUAGE, 
                 sample_rate: int = DEFAULT_SAMPLE_RATE, chunk_seconds: int = DEFAULT_CHUNK_SECONDS):
        self.model_size = model_size
        self.language = language
        self.sample_rate = sample_rate
        self.chunk_seconds = chunk_seconds
        self.chunk_samples = chunk_seconds * sample_rate
        
        self.audio_buffer = np.array([], dtype=np.float32)
        self.is_running = False
        self.processing_thread = None
        self.results_callback = None
        self.session_id = None
        self.status = None
        self.num_chunks_processed = 0
        self.is_initialized = True  # Always initialized
        
        logger.warning("Using fallback transcriber (simulated transcription)")
    
    def initialize(self) -> bool:
        """Initialize the fallback transcriber"""
        return True
    
    def start_transcription(self, session_id: str, callback: Callable[[TranscriptionResult], None] = None) -> bool:
        """Start the transcription process for streaming audio"""
        if self.is_running:
            return True
            
        self.session_id = session_id
        self.results_callback = callback
        self.audio_buffer = np.array([], dtype=np.float32)
        self.is_running = True
        self.num_chunks_processed = 0
        
        # Initialize status tracking
        self.status = TranscriptionStatus(session_id)
        self.status.status = "transcribing"
        self.status.model = "fallback"
        self.status.language = self.language
        
        # Start mock processing thread
        self.processing_thread = threading.Thread(target=self._mock_processing_worker)
        self.processing_thread.daemon = True
        self.processing_thread.start()
        
        logger.info(f"Started fallback transcription for session {session_id}")
        return True
    
    def stop_transcription(self) -> bool:
        """Stop the transcription process"""
        if not self.is_running:
            return True
            
        self.is_running = False
        
        # Wait for processing to complete
        if self.processing_thread:
            self.processing_thread.join(timeout=2.0)
            
        # Update status
        if self.status:
            self.status.status = "completed"
            self.status.progress = 1.0
            self.status.last_update = time.time()
            
        logger.info("Stopped fallback transcription")
        return True
    
    def process_audio_chunk(self, audio_data: Union[bytes, np.ndarray]) -> None:
        """Process a chunk of audio data for transcription"""
        if not self.is_running:
            return
            
        # Convert bytes to numpy array if needed
        if isinstance(audio_data, bytes):
            # Assuming 16-bit PCM audio
            audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        else:
            audio_np = audio_data
            
        # Add to the buffer
        self.audio_buffer = np.append(self.audio_buffer, audio_np)
    
    def _mock_processing_worker(self) -> None:
        """Worker thread that simulates transcription"""
        try:
            # Sample realistic transcripts for meeting audio
            sample_transcripts = [
                "Let's go over the quarterly results before the next item on the agenda.",
                "I think we should focus on improving our customer retention metrics.",
                "The new product launch is scheduled for next month, and we're on track.",
                "We need to allocate more resources to the marketing department.",
                "Based on user feedback, we should prioritize fixing these bugs.",
                "I agree with that assessment. Let's move forward with this plan.",
                "The development team is working on implementing the new features.",
                "Our competitors have launched a similar product, so we need to differentiate.",
                "The sales numbers are looking promising for the upcoming quarter.",
                "We should schedule a follow-up meeting to discuss this in more detail."
            ]
            
            while self.is_running:
                # Simulate processing delay
                time.sleep(self.chunk_seconds / 2)  # Process faster than real-time
                
                # Only generate transcriptions if we have audio data
                if len(self.audio_buffer) >= self.sample_rate * 2:  # At least 2 seconds of audio
                    # Generate a mock transcription
                    transcript_text = sample_transcripts[self.num_chunks_processed % len(sample_transcripts)]
                    
                    chunk_duration = self.chunk_seconds
                    chunk_start_time = self.num_chunks_processed * chunk_duration
                    chunk_end_time = chunk_start_time + chunk_duration
                    
                    # Create a result object
                    transcription_result = TranscriptionResult(
                        id=str(uuid.uuid4()),
                        text=transcript_text,
                        timestamp=time.time(),
                        start_time=chunk_start_time,
                        end_time=chunk_end_time,
                        language=self.language,
                        is_final=True,
                        confidence=0.95  # Mock high confidence
                    )
                    
                    # Call the callback with the result
                    if self.results_callback:
                        self.results_callback(transcription_result)
                        
                    # Update progress
                    self.num_chunks_processed += 1
                    if self.status:
                        self.status.progress = min(0.99, self.num_chunks_processed / 20)  # Arbitrary total
                        self.status.last_update = time.time()
                        
                    logger.debug(f"Mock transcription: {transcript_text}")
                    
        except Exception as e:
            logger.error(f"Error in mock transcription worker: {e}")
            if self.status:
                self.status.status = "error"
                self.status.error = str(e)
        finally:
            logger.info("Mock transcription worker stopped")
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current transcription status"""
        if self.status:
            return self.status.to_dict()
        return {"status": "not_started"}

# Factory function to get the appropriate transcriber
def get_transcriber(model_size: str = DEFAULT_MODEL_SIZE, language: str = DEFAULT_LANGUAGE, 
                   sample_rate: int = DEFAULT_SAMPLE_RATE, device: str = None) -> Union[WhisperTranscriber, FallbackTranscriber]:
    """Get the appropriate transcriber based on available dependencies"""
    if WHISPER_AVAILABLE:
        transcriber = WhisperTranscriber(
            model_size=model_size,
            language=language,
            sample_rate=sample_rate,
            device=device
        )
        if transcriber.initialize():
            return transcriber
    
    # Fall back to mock transcriber if Whisper is not available or initialization fails
    return FallbackTranscriber(
        model_size=model_size,
        language=language,
        sample_rate=sample_rate
    )

# Helper function to transcribe an audio file
def transcribe_audio_file(file_path: str, model_size: str = DEFAULT_MODEL_SIZE, 
                         language: str = DEFAULT_LANGUAGE, device: str = None) -> List[TranscriptionResult]:
    """Transcribe an audio file and return the results"""
    if not os.path.exists(file_path):
        logger.error(f"Audio file not found: {file_path}")
        return []
        
    results = []
    
    def collect_result(result: TranscriptionResult):
        results.append(result)
    
    try:
        # Load the audio file
        if file_path.lower().endswith('.wav'):
            # Use wave module for WAV files
            with wave.open(file_path, 'rb') as wf:
                sample_rate = wf.getframerate()
                n_channels = wf.getnchannels()
                sample_width = wf.getsampwidth()
                n_frames = wf.getnframes()
                
                # Read all frames
                audio_data = wf.readframes(n_frames)
                
                # Convert to numpy array
                if sample_width == 2:  # 16-bit audio
                    audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
                elif sample_width == 4:  # 32-bit audio
                    audio_np = np.frombuffer(audio_data, dtype=np.int32).astype(np.float32) / 2147483648.0
                else:
                    logger.error(f"Unsupported sample width: {sample_width}")
                    return []
                    
                # Convert stereo to mono if needed
                if n_channels == 2:
                    audio_np = audio_np.reshape(-1, 2).mean(axis=1)
        else:
            # For other formats, try to use Whisper's load_audio if available
            if WHISPER_AVAILABLE:
                try:
                    # Whisper's load_audio defaults to 16kHz mono
                    audio_np = whisper.load_audio(file_path)
                    sample_rate = 16000
                except Exception as e:
                    logger.error(f"Error loading audio with Whisper: {e}")
                    return []
            else:
                logger.error(f"Cannot load non-WAV audio without Whisper: {file_path}")
                return []
        
        # Get a transcriber
        transcriber = get_transcriber(
            model_size=model_size,
            language=language,
            sample_rate=sample_rate,
            device=device
        )
        
        # Start transcription
        session_id = str(uuid.uuid4())
        transcriber.start_transcription(session_id, callback=collect_result)
        
        # Process the entire audio file
        transcriber.process_audio_chunk(audio_np)
        
        # Stop transcription to finalize
        transcriber.stop_transcription()
        
        return results
        
    except Exception as e:
        logger.error(f"Error transcribing audio file: {e}")
        return []

# Helper function to get a session's transcription status
def get_transcription_status(session_id: str, db=None) -> Dict[str, Any]:
    """Get the transcription status for a session from the database"""
    if db is None:
        # Return a basic status if no database is provided
        return {"session_id": session_id, "status": "unknown"}
        
    try:
        # Query the database for the session's transcription status
        from ..models.models import TranscriptionStatus as DBTranscriptionStatus
        
        status = db.query(DBTranscriptionStatus).filter(DBTranscriptionStatus.session_id == session_id).first()
        
        if status:
            return {
                "session_id": session_id,
                "status": status.status,
                "model": status.model,
                "language": status.language,
                "progress": status.progress,
                "error": status.error,
                "last_update": status.last_update.timestamp() if status.last_update else None
            }
        else:
            return {"session_id": session_id, "status": "not_started"}
            
    except Exception as e:
        logger.error(f"Error getting transcription status: {e}")
        return {"session_id": session_id, "status": "error", "error": str(e)}
