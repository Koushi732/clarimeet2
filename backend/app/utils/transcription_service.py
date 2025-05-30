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

# Try to import deepgram for alternative transcription
try:
    import asyncio
    from deepgram import Deepgram
    DEEPGRAM_AVAILABLE = True
except ImportError:
    DEEPGRAM_AVAILABLE = False
    logging.warning("Deepgram is not installed. Using primary transcription method.")

# Try to import assemblyai for alternative transcription
try:
    import assemblyai as aai
    ASSEMBLYAI_AVAILABLE = True
except ImportError:
    ASSEMBLYAI_AVAILABLE = False
    logging.warning("AssemblyAI is not installed. Using primary transcription method.")

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

# Real-time audio processing
audio_chunk_queues = {}
audio_processors = {}

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

async def _transcribe_with_whisper(audio_path: str, model_name: str = "small", language: str = "en") -> List[Dict[str, Any]]:
    """Transcribe audio with Whisper."""
    try:
        # Load model
        model = _load_whisper_model(model_name)
        if not model:
            return []
        
        # Run transcription in a thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: model.transcribe(
                audio_path,
                language=language,
                verbose=False,
                word_timestamps=True
            )
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

async def _transcribe_audio_stream(session_id: str, audio_queue: queue.Queue, model: str, language: str):
    """Transcribe audio stream in real-time."""
    try:
        # Update status
        transcription_status[session_id] = {
            "status": "transcribing",
            "model": model,
            "language": language,
            "last_update": time.time(),
            "chunks_processed": 0,
            "current_buffer": []
        }
        
        # Setup transcription buffer for accumulating chunks
        buffer_size = 12  # Number of chunks to accumulate before processing
        audio_buffer = []
        
        # Register the queue for this session
        audio_chunk_queues[session_id] = audio_queue
        
        # Process audio stream
        while True:
            try:
                # Get audio chunk from queue
                audio_chunk = audio_queue.get(timeout=1.0)
                
                # Check for termination signal
                if audio_chunk is None:
                    logger.info(f"Received termination signal for session {session_id}")
                    
                    # Process any remaining audio in buffer before terminating
                    if audio_buffer:
                        # Process the accumulated buffer
                        await _process_audio_buffer(session_id, audio_buffer, model, language)
                    
                    break
                
                # Add chunk to buffer
                audio_buffer.append(audio_chunk)
                
                # Process buffer when it reaches the desired size
                if len(audio_buffer) >= buffer_size:
                    # Process the accumulated buffer
                    await _process_audio_buffer(session_id, audio_buffer, model, language)
                    
                    # Clear the buffer after processing
                    audio_buffer = []
                
                # Update status
                if session_id in transcription_status:
                    transcription_status[session_id]["chunks_processed"] += 1
                    transcription_status[session_id]["last_update"] = time.time()
            
            except queue.Empty:
                # No audio chunk available, process buffer if it has content
                if audio_buffer:
                    # Process what we have so far
                    await _process_audio_buffer(session_id, audio_buffer, model, language)
                    audio_buffer = []
                continue
    
    except Exception as e:
        logger.error(f"Error in transcription thread for session {session_id}: {e}")
        
        if session_id in transcription_status:
            transcription_status[session_id]["status"] = "error"
            transcription_status[session_id]["error"] = str(e)

async def _process_audio_buffer(session_id: str, audio_buffer, model: str, language: str):
    """Process a buffer of audio chunks for transcription."""
    try:
        # Determine the transcription provider based on the model prefix
        if model.startswith("whisper"):
            # Extract model size from the model string (e.g., "whisper-small" -> "small")
            model_size = model.split("-")[1] if "-" in model else "small"
            
            # Combine audio chunks into a single file for processing
            combined_audio_path = os.path.join(
                os.path.dirname(audio_buffer[0]),
                f"combined_{int(time.time())}.wav"
            )
            
            # TODO: Implement proper audio concatenation
            # For now, just use the first chunk as a placeholder
            combined_audio_path = audio_buffer[0]
            
            # Process with Whisper
            segments = await _transcribe_with_whisper(combined_audio_path, model_size, language)
            
        elif model.startswith("deepgram") and DEEPGRAM_AVAILABLE:
            # Process with Deepgram
            from ..config import settings
            dg_client = Deepgram(settings.DEEPGRAM_API_KEY)
            
            # Combine audio chunks
            audio_data = b''.join([open(chunk, 'rb').read() for chunk in audio_buffer])
            
            # Send to Deepgram API
            source = {"buffer": audio_data, "mimetype": "audio/pcm"}
            response = await dg_client.transcription.prerecorded(source, {
                'punctuate': True,
                'language': language,
                'model': 'nova-2'
            })
            
            # Extract results
            segments = []
            for result in response.results.channels[0].alternatives[0].words:
                segments.append({
                    "timestamp": result.start,
                    "end_timestamp": result.end,
                    "text": result.word,
                    "confidence": result.confidence
                })
            
        elif model.startswith("assemblyai") and ASSEMBLYAI_AVAILABLE:
            # Process with AssemblyAI
            from ..config import settings
            aai.settings.api_key = settings.ASSEMBLYAI_API_KEY
            
            # Combine audio chunks
            combined_audio_path = os.path.join(
                os.path.dirname(audio_buffer[0]),
                f"combined_{int(time.time())}.wav"
            )
            
            # TODO: Implement proper audio concatenation
            # For now, just use the first chunk as a placeholder
            combined_audio_path = audio_buffer[0]
            
            # Create transcriber
            transcriber = aai.Transcriber()
            transcript = await transcriber.transcribe(combined_audio_path)
            
            # Extract results
            segments = []
            for word in transcript.words:
                segments.append({
                    "timestamp": word.start,
                    "end_timestamp": word.end,
                    "text": word.text,
                    "confidence": word.confidence
                })
        
        else:
            # Fallback to Whisper if model not recognized
            logger.warning(f"Unrecognized model '{model}', falling back to whisper-small")
            segments = await _transcribe_with_whisper(audio_buffer[0], "small", language)
        
        # Add transcription results to the status
        if session_id in transcription_status and segments:
            # Combine segments into a single piece of text
            text = " ".join([segment["text"] for segment in segments])
            
            # Create a transcription entry
            transcription = {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "timestamp": time.time(),
                "text": text,
                "segments": segments,
                "model": model
            }
            
            # Add to current buffer for this session
            transcription_status[session_id]["current_buffer"].append(transcription)
            
            # If buffer reaches a threshold, save to database and clear
            if len(transcription_status[session_id]["current_buffer"]) >= 5:
                # TODO: Save to database
                transcription_status[session_id]["current_buffer"] = []
            
            # Broadcast the transcription via WebSocket if possible
            try:
                from ..routers.websocket_router import connection_manager
                
                # Broadcast to all clients subscribed to this session
                await connection_manager.broadcast_to_session(
                    session_id=session_id,
                    message_type="transcription",
                    data=transcription
                )
            except Exception as e:
                logger.error(f"Error broadcasting transcription: {e}")
    
    except Exception as e:
        logger.error(f"Error processing audio buffer: {e}")
        # Don't raise the exception, just log it to avoid breaking the stream processing

async def process_audio_file(session_id: str, audio_path: str, model: str = "whisper-small", language: str = "en", db=None) -> bool:
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
        return True
        
    except Exception as e:
        logger.error(f"Error processing audio file: {e}")
        if session_id in transcription_status:
            transcription_status[session_id]["status"] = "error"
            transcription_status[session_id]["error"] = str(e)
        return False

async def start_transcription(session_id: str, audio_path: str, model: str = "whisper-small", language: str = "en") -> bool:
    """Start real-time transcription for a session."""
    try:
        # Check if already transcribing
        if session_id in active_transcriptions:
            logger.warning(f"Already transcribing for session {session_id}")
            return False
        
        # Create audio queue
        audio_queue = queue.Queue()
        
        # Start transcription in a separate thread
        loop = asyncio.get_event_loop()
        task = loop.create_task(_transcribe_audio_stream(session_id, audio_queue, model, language))
        
        # Store active transcription
        active_transcriptions[session_id] = {
            "task": task,
            "audio_queue": audio_queue,
            "model": model,
            "language": language,
            "audio_path": audio_path
        }
        
        # Wait for transcription to start
        await asyncio.sleep(0.5)
        
        # Check if transcription started successfully
        if session_id in transcription_status and transcription_status[session_id]["status"] == "transcribing":
            return True
        else:
            return False
    except Exception as e:
        logger.error(f"Error starting transcription: {e}")
        return False

async def stop_transcription(session_id: str) -> bool:
    """Stop real-time transcription for a session."""
    try:
        # Check if transcribing
        if session_id not in active_transcriptions:
            logger.warning(f"No active transcription for session {session_id}")
            return False
        
        # Update status
        if session_id in transcription_status:
            transcription_status[session_id]["status"] = "stopping"
        
        # Signal task to stop
        active_transcriptions[session_id]["audio_queue"].put(None)
        
        # Wait for task to finish (with timeout)
        try:
            task = active_transcriptions[session_id]["task"]
            await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for transcription task to complete for session {session_id}")
        
        # Clean up
        if session_id in audio_chunk_queues:
            del audio_chunk_queues[session_id]
        
        # Remove from active transcriptions
        del active_transcriptions[session_id]
        
        # Update status
        if session_id in transcription_status:
            transcription_status[session_id]["status"] = "stopped"
            
            # Process and save any remaining transcriptions in the buffer
            if transcription_status[session_id].get("current_buffer"):
                # TODO: Save to database
                transcription_status[session_id]["current_buffer"] = []
        
        return True
    except Exception as e:
        logger.error(f"Error stopping transcription: {e}")
        return False

async def get_transcription_status(session_id: str) -> Dict[str, Any]:
    """Get transcription status for a session."""
    try:
        # Check if transcribing
        if session_id in transcription_status:
            return {
                "session_id": session_id,
                "status": transcription_status[session_id]["status"],
                "model": transcription_status[session_id].get("model"),
                "language": transcription_status[session_id].get("language"),
                "chunks_processed": transcription_status[session_id].get("chunks_processed", 0),
                "last_update": transcription_status[session_id].get("last_update")
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

async def process_audio_chunk(session_id: str, chunk_path: str, chunk_index: int, timestamp: Optional[float] = None) -> bool:
    """Process a single audio chunk for real-time transcription.
    
    Args:
        session_id: ID of the session the audio chunk belongs to
        chunk_path: Path to the audio chunk file
        chunk_index: Index of the chunk in the sequence
        timestamp: Optional timestamp of when the chunk was recorded
        
    Returns:
        bool: True if the chunk was processed successfully, False otherwise
    """
    try:
        # Check if we have an active transcription for this session
        if session_id not in active_transcriptions:
            # Start a new transcription if one doesn't exist
            logger.info(f"Starting new transcription for session {session_id} from chunk")
            
            # Determine the folder path from the chunk path
            folder_path = os.path.dirname(chunk_path)
            
            # Use default model and language if not specified
            from ..config import settings
            model = settings.DEFAULT_TRANSCRIPTION_PROVIDER or "whisper-small"
            language = settings.TRANSCRIPTION_LANGUAGE or "en"
            
            # Start transcription
            success = await start_transcription(session_id, folder_path, model, language)
            if not success:
                logger.error(f"Failed to start transcription for session {session_id}")
                return False
        
        # Add the chunk to the queue for processing
        if session_id in active_transcriptions:
            active_transcriptions[session_id]["audio_queue"].put(chunk_path)
            return True
        else:
            logger.error(f"No active transcription found for session {session_id}")
            return False
            
    except Exception as e:
        logger.error(f"Error processing audio chunk: {e}")
        return False
