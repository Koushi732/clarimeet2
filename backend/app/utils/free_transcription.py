#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Free Transcription Service for Clarimeet

Provides real-time transcription using locally available models without API costs.
"""

import asyncio
import logging
import os
import time
import tempfile
import uuid
import threading
import queue
from typing import Dict, List, Optional, Any, Set, Callable

import numpy as np
try:
    import torch
    import torchaudio
    from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

# Configure logging
logger = logging.getLogger(__name__)

# Check if GPU is available
DEVICE = "cuda:0" if TRANSFORMERS_AVAILABLE and torch.cuda.is_available() else "cpu"

class CallbackManager:
    """Manages callbacks for transcription updates"""
    
    def __init__(self):
        self.callbacks: Dict[str, Dict[str, Callable]] = {}
        
    async def register_callback(self, session_id: str, callback) -> str:
        """Register a callback for a session"""
        if session_id not in self.callbacks:
            self.callbacks[session_id] = {}
            
        callback_id = str(uuid.uuid4())
        self.callbacks[session_id][callback_id] = callback
        return callback_id
    
    async def unregister_callback(self, session_id: str, callback_id: str) -> bool:
        """Unregister a callback"""
        if session_id in self.callbacks and callback_id in self.callbacks[session_id]:
            del self.callbacks[session_id][callback_id]
            return True
        return False
    
    async def trigger_callbacks(self, session_id: str, data: Dict[str, Any]) -> None:
        """Trigger all callbacks for a session"""
        if session_id not in self.callbacks:
            return
        
        for callback_id, callback in list(self.callbacks[session_id].items()):
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(data)
                else:
                    callback(data)
            except Exception as e:
                logger.error(f"Error in callback {callback_id}: {e}")

class LocalWhisperService:
    """Transcription service using locally downloaded Whisper model (free)"""
    
    def __init__(self, model_size="tiny"):
        """
        Initialize with a specified model size:
        - 'tiny': ~75MB, fastest, least accurate
        - 'base': ~142MB, fast, basic accuracy
        - 'small': ~466MB, moderate speed/accuracy
        - 'medium': ~1.5GB, slower but more accurate
        - 'large': ~3GB, slowest, most accurate
        """
        self.model_size = model_size
        self.model = None
        self.processor = None
        self.callback_manager = CallbackManager()
        self.sessions = {}
        self._load_model()
    
    def _load_model(self):
        """Load the Whisper model"""
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Transformers library not available, transcription will be limited")
            return
        
        try:
            logger.info(f"Loading Whisper {self.model_size} model on {DEVICE}")
            self.model = pipeline(
                "automatic-speech-recognition",
                model=f"openai/whisper-{self.model_size}",
                device=DEVICE
            )
            logger.info("Whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading Whisper model: {e}")
            self.model = None
    
    async def transcribe_audio(self, audio_data: bytes, language: str = "en") -> Dict[str, Any]:
        """Transcribe complete audio file"""
        try:
            # Save audio to temp file for processing
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name
            
            # Process the audio
            result = await self._process_audio(temp_path, language)
            
            # Clean up
            try:
                os.unlink(temp_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")
            
            return result
        except Exception as e:
            logger.error(f"Error in transcribe_audio: {e}")
            return {"error": str(e), "text": "", "is_final": True}
    
    async def _process_audio(self, audio_path: str, language: str) -> Dict[str, Any]:
        """Process audio file with Whisper"""
        if self.model is None:
            return {"error": "Whisper model not loaded", "text": "[Transcription unavailable]"}
        
        try:
            # Run the transcription in a separate thread to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.model(
                    audio_path, 
                    generate_kwargs={"language": language} if language != "auto" else {}
                )
            )
            
            # Format the result
            if isinstance(result, dict) and "text" in result:
                return {
                    "text": result["text"].strip(),
                    "language": language,
                    "is_final": True
                }
            else:
                return {
                    "text": str(result),
                    "language": language,
                    "is_final": True
                }
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            return {"error": str(e), "text": "[Processing error]"}
    
    async def start_session(self, session_id: str, language: str = "en") -> None:
        """Start a new transcription session"""
        self.sessions[session_id] = {
            "language": language,
            "start_time": time.time(),
            "audio_buffer": bytearray(),
            "chunks": [],
            "is_active": True
        }
        logger.info(f"Started transcription session {session_id}")
    
    async def process_audio_chunk(self, session_id: str, audio_chunk: bytes) -> Optional[Dict[str, Any]]:
        """Process an audio chunk in a streaming session"""
        if session_id not in self.sessions:
            return None
        
        session = self.sessions[session_id]
        
        # Add chunk to buffer
        session["audio_buffer"].extend(audio_chunk)
        
        # Process if buffer is large enough (>3 seconds of audio)
        # 16kHz 16-bit mono audio is ~32KB per second
        if len(session["audio_buffer"]) > 96000:  # ~3 seconds
            return await self._process_buffer(session_id)
        
        return {"status": "buffering", "session_id": session_id}
    
    async def _process_buffer(self, session_id: str) -> Dict[str, Any]:
        """Process the accumulated audio buffer"""
        session = self.sessions[session_id]
        
        # Save buffer to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            temp_file.write(session["audio_buffer"])
            temp_path = temp_file.name
        
        # Process the audio
        result = await self._process_audio(temp_path, session["language"])
        
        # Clear buffer after processing
        session["audio_buffer"] = bytearray()
        
        # Clean up temp file
        try:
            os.unlink(temp_path)
        except Exception as e:
            logger.warning(f"Failed to delete temp file: {e}")
        
        # Add result to session
        result["session_id"] = session_id
        result["is_final"] = False
        session["chunks"].append(result)
        
        # Notify callbacks
        await self.callback_manager.trigger_callbacks(session_id, result)
        
        return result
    
    async def end_session(self, session_id: str) -> Dict[str, Any]:
        """End a transcription session and get final results"""
        if session_id not in self.sessions:
            return {"error": "Session not found"}
        
        session = self.sessions[session_id]
        session["is_active"] = False
        
        # Process any remaining audio in the buffer
        if len(session["audio_buffer"]) > 0:
            await self._process_buffer(session_id)
        
        # Combine all chunks
        combined_text = " ".join([chunk.get("text", "") for chunk in session["chunks"]])
        
        # Create final result
        final_result = {
            "session_id": session_id,
            "text": combined_text,
            "chunks": session["chunks"],
            "language": session["language"],
            "duration": time.time() - session["start_time"],
            "is_final": True
        }
        
        # Clean up
        del self.sessions[session_id]
        
        return final_result
    
    async def register_callback(self, session_id: str, callback) -> str:
        """Register a callback for transcription updates"""
        return await self.callback_manager.register_callback(session_id, callback)
    
    async def unregister_callback(self, session_id: str, callback_id: str) -> bool:
        """Unregister a callback"""
        return await self.callback_manager.unregister_callback(session_id, callback_id)

# Create a singleton instance
transcription_service = LocalWhisperService()
