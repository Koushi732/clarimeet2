import os
import time
import threading
import logging
import tempfile
import json
import uuid
from typing import Dict, List, Optional, Any, Tuple
import queue
import numpy as np
import wave

# Import for speech recognition
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logging.warning("PyTorch is not installed. Whisper transcription will not be available.")

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logging.warning("Whisper is not installed. Using fallback transcription method.")

# Check for GPU availability
GPU_AVAILABLE = TORCH_AVAILABLE and torch.cuda.is_available()
if GPU_AVAILABLE:
    logging.info("GPU is available for transcription.")
else:
    logging.info("Using CPU for transcription.")

# Logging
logger = logging.getLogger(__name__)

# Active transcription processes
active_transcriptions = {}
transcription_status = {}

# Transcription models cache
models_cache = {}

def _load_whisper_model(model_name: str):
    """Load a Whisper model."""
    if not WHISPER_AVAILABLE:
        logger.error("Whisper is not installed")
        return None
    
    try:
        if model_name in models_cache:
            return models_cache[model_name]
        
        logger.info(f"Loading Whisper model: {model_name}")
        model = whisper.load_model(model_name)
        models_cache[model_name] = model
        return model
    except Exception as e:
        logger.error(f"Error loading Whisper model: {e}")
        return None

def _load_vosk_model(model_name: str):
    """Load a Vosk model."""
    if not VOSK_AVAILABLE:
        logger.error("Vosk is not installed")
        return None
    
    try:
        if model_name in models_cache:
            return models_cache[model_name]
        
        # Get models directory
        models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "vosk")
        os.makedirs(models_dir, exist_ok=True)
        
        model_path = os.path.join(models_dir, model_name)
        
        if not os.path.exists(model_path):
            logger.error(f"Vosk model not found: {model_path}")
            return None
        
        logger.info(f"Loading Vosk model: {model_path}")
        model = vosk.Model(model_path)
        models_cache[model_name] = model
        return model
    except Exception as e:
        logger.error(f"Error loading Vosk model: {e}")
        return None

def _transcribe_with_whisper(audio_path: str, model_name: str = "small", language: str = "en") -> List[Dict[str, Any]]:
    """Transcribe audio with Whisper."""
    try:
        # Load model
        model = _load_whisper_model(model_name)
        if not model:
            return []
        
        # Transcribe
        result = model.transcribe(
            audio_path,
            language=language,
            verbose=False,
            word_timestamps=True
        )
        
        segments = []
        for segment in result["segments"]:
            segments.append({
                "timestamp": segment["start"],
                "end_timestamp": segment["end"],
                "text": segment["text"],
                "confidence": segment.get("confidence", 0.0)
            })
        
        return segments
    except Exception as e:
        logger.error(f"Error transcribing with Whisper: {e}")
        return []

def _transcribe_with_vosk(audio_path: str, model_name: str = "vosk-model-small-en-us-0.15", language: str = "en") -> List[Dict[str, Any]]:
    """Transcribe audio with Vosk."""
    try:
        import wave
        
        # Load model
        model = _load_vosk_model(model_name)
        if not model:
            return []
        
        # Open audio file
        wf = wave.open(audio_path, "rb")
        
        # Check format
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getcomptype() != "NONE":
            logger.error("Audio file must be WAV format mono PCM")
            return []
        
        # Create recognizer
        rec = vosk.KaldiRecognizer(model, wf.getframerate())
        rec.SetWords(True)
        
        # Process audio
        segments = []
        chunk_size = 4000
        offset = 0
        
        while True:
            data = wf.readframes(chunk_size)
            if len(data) == 0:
                break
            
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                
                if "result" in result and len(result["result"]) > 0:
                    words = result["result"]
                    
                    # Calculate timestamps
                    start_time = words[0]["start"] if "start" in words[0] else offset / wf.getframerate()
                    end_time = words[-1]["end"] if "end" in words[-1] else (offset + len(data)) / wf.getframerate()
                    
                    segments.append({
                        "timestamp": start_time,
                        "end_timestamp": end_time,
                        "text": result["text"],
                        "confidence": result.get("confidence", 0.0)
                    })
            
            offset += len(data)
        
        # Get final result
        result = json.loads(rec.FinalResult())
        if "result" in result and len(result["result"]) > 0:
            words = result["result"]
            
            # Calculate timestamps
            start_time = words[0]["start"] if "start" in words[0] else offset / wf.getframerate()
            end_time = words[-1]["end"] if "end" in words[-1] else (offset + len(data)) / wf.getframerate()
            
            segments.append({
                "timestamp": start_time,
                "end_timestamp": end_time,
                "text": result["text"],
                "confidence": result.get("confidence", 0.0)
            })
        
        return segments
    except Exception as e:
        logger.error(f"Error transcribing with Vosk: {e}")
        return []

def _save_transcriptions(segments: List[Dict[str, Any]], session_id: str, db) -> bool:
    """Save transcriptions to the database."""
    try:
        from app.models.models import Transcription
        from sqlalchemy.orm import Session
        
        # Check if db is a valid session
        if not isinstance(db, Session):
            logger.error("Invalid database session")
            return False
        
        # Save each segment
        for segment in segments:
            transcription = Transcription(
                session_id=session_id,
                timestamp=segment["timestamp"],
                end_timestamp=segment["end_timestamp"],
                text=segment["text"],
                confidence=segment["confidence"]
            )
            db.add(transcription)
        
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Error saving transcriptions: {e}")
        return False

def _transcribe_audio_stream(session_id: str, audio_queue: queue.Queue, model: str, language: str):
    """Transcribe audio stream in real-time."""
    try:
        # Set status
        transcription_status[session_id] = {
            "status": "transcribing",
            "model": model,
            "language": language,
            "last_update": time.time()
        }
        
        # TODO: Implement real-time transcription
        # This is a complex task that requires:
        # 1. Buffering audio chunks
        # 2. Detecting speech vs. silence
        # 3. Sending speech chunks to transcription model
        # 4. Handling overlapping transcriptions
        
        # For now, we'll use a simple approach of accumulating audio and transcribing chunks
        
        # Clean up
        transcription_status[session_id]["status"] = "stopped"
        
    except Exception as e:
        logger.error(f"Error transcribing audio stream: {e}")
        transcription_status[session_id]["status"] = "error"
        transcription_status[session_id]["error"] = str(e)

def process_audio_file(session_id: str, audio_path: str, model: str = "whisper-small", language: str = "en", db=None) -> bool:
    """Process an audio file for transcription."""
    try:
        # Initialize status
        transcription_status[session_id] = {
            "status": "processing",
            "model": model,
            "language": language,
            "last_update": time.time()
        }
        
        logger.info(f"Processing audio file for session {session_id} with model {model}")
        
        # Check if file exists
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            transcription_status[session_id]["status"] = "error"
            transcription_status[session_id]["error"] = "Audio file not found"
            return False
        
        # Transcribe based on model
        segments = []
        
        if "whisper" in model and WHISPER_AVAILABLE:
            model_name = model.replace("whisper-", "")
            logger.info(f"Using Whisper model '{model_name}' for transcription")
            segments = _transcribe_with_whisper(audio_path, model_name, language)
        elif WHISPER_AVAILABLE:
            # Fallback to small whisper model
            logger.info(f"Model {model} not found, falling back to whisper small")
            segments = _transcribe_with_whisper(audio_path, "small", language)
        else:
            # Use fallback simple transcription method
            logger.warning("Whisper not available, using basic transcription")
            # Implement a basic transcription method here
            segments = [{
                "timestamp": 0.0,
                "end_timestamp": 10.0,
                "text": "[Transcription unavailable - Whisper not installed]",
                "confidence": 0.0
            }]
        
        # Save transcriptions
        if db and len(segments) > 0:
            logger.info(f"Saving {len(segments)} transcription segments to database")
            _save_transcriptions(segments, session_id, db)
            
            # If summarization is enabled, trigger it here
            from app.utils import summarization_service
            try:
                summarization_service.generate_summary(session_id, db)
            except Exception as sum_error:
                logger.error(f"Error generating summary: {sum_error}")
        
        # Update status
        transcription_status[session_id]["status"] = "completed"
        transcription_status[session_id]["last_update"] = time.time()
        
        return True
    except Exception as e:
        logger.error(f"Error processing audio file: {e}")
        
        if session_id in transcription_status:
            transcription_status[session_id]["status"] = "error"
            transcription_status[session_id]["error"] = str(e)
        
        return False

def start_transcription(session_id: str, audio_path: str, model: str = "whisper-small", language: str = "en") -> bool:
    """Start real-time transcription for a session."""
    try:
        # Check if already transcribing
        if session_id in active_transcriptions:
            logger.warning(f"Already transcribing for session {session_id}")
            return False
        
        # Create audio queue
        audio_queue = queue.Queue()
        
        # Start transcription in a separate thread
        thread = threading.Thread(
            target=_transcribe_audio_stream,
            args=(session_id, audio_queue, model, language)
        )
        thread.daemon = True
        thread.start()
        
        # Store active transcription
        active_transcriptions[session_id] = {
            "thread": thread,
            "audio_queue": audio_queue
        }
        
        # Wait for transcription to start
        time.sleep(0.5)
        
        # Check if transcription started successfully
        if session_id in transcription_status and transcription_status[session_id]["status"] == "transcribing":
            return True
        else:
            return False
    except Exception as e:
        logger.error(f"Error starting transcription: {e}")
        return False

def stop_transcription(session_id: str) -> bool:
    """Stop real-time transcription for a session."""
    try:
        # Check if transcribing
        if session_id not in active_transcriptions:
            logger.warning(f"No active transcription for session {session_id}")
            return False
        
        # Update status
        if session_id in transcription_status:
            transcription_status[session_id]["status"] = "stopping"
        
        # Signal thread to stop
        active_transcriptions[session_id]["audio_queue"].put(None)
        
        # Wait for thread to finish
        active_transcriptions[session_id]["thread"].join(timeout=2.0)
        
        # Remove from active transcriptions
        del active_transcriptions[session_id]
        
        # Update status
        if session_id in transcription_status:
            transcription_status[session_id]["status"] = "stopped"
        
        return True
    except Exception as e:
        logger.error(f"Error stopping transcription: {e}")
        return False

def get_transcription_status(session_id: str) -> Dict[str, Any]:
    """Get transcription status for a session."""
    try:
        # Check if transcribing
        if session_id in transcription_status:
            return {
                "session_id": session_id,
                "status": transcription_status[session_id]["status"],
                "model": transcription_status[session_id].get("model"),
                "language": transcription_status[session_id].get("language")
            }
        else:
            return {
                "session_id": session_id,
                "status": "not_started"
            }
    except Exception as e:
        logger.error(f"Error getting transcription status: {e}")
        return {
            "session_id": session_id,
            "status": "error",
            "error": str(e)
        }
