#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Deepgram Transcription Service for Clarimeet

Provides real-time transcription using Deepgram's free tier API ($200 free credit).
"""

import asyncio
import base64
import json
import logging
import os
import time
import uuid
import websockets
from typing import Dict, List, Optional, Any, Callable, Set

import aiohttp

# Import database repositories
from app.database import transcription_repository, speaker_repository

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set API key from environment variable or use placeholder
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")

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

class DeepgramTranscriptionService:
    """Transcription service using Deepgram's API (free tier)"""
    
    def __init__(self):
        self.api_key = DEEPGRAM_API_KEY
        self.callback_manager = CallbackManager()
        self.sessions = {}
        self.ws_connections = {}
        
    async def start_session(self, session_id: str, language: str = "en") -> None:
        """Start a new transcription session"""
        if not self.api_key:
            logger.warning("Deepgram API key not set, transcription will be limited")
            return
            
        if session_id in self.sessions:
            logger.info(f"Session {session_id} already exists")
            return
            
        self.sessions[session_id] = {
            "language": language,
            "start_time": time.time(),
            "is_active": True,
            "chunks": [],
            "final_transcript": "",
            "speakers": {},
        }
        
        # Start WebSocket connection in background
        asyncio.create_task(self._connect_websocket(session_id))
        logger.info(f"Started Deepgram transcription session {session_id}")
        
    async def _connect_websocket(self, session_id: str) -> None:
        """Connect to Deepgram's real-time WebSocket API"""
        if session_id not in self.sessions:
            return
            
        session = self.sessions[session_id]
        
        # Configure the connection parameters for Deepgram
        params = {
            "punctuate": "true",
            "diarize": "true",  # Enable speaker diarization
            "language": session["language"],
            "model": "nova-2",  # Their latest and most accurate model
            "smart_format": "true",
            "utterances": "true"
        }
        
        # Construct WebSocket URL with parameters
        param_string = "&".join([f"{k}={v}" for k, v in params.items()])
        ws_url = f"wss://api.deepgram.com/v1/listen?{param_string}"
        
        try:
            # Connect to Deepgram's real-time API
            async with websockets.connect(
                ws_url,
                extra_headers={"Authorization": f"Token {self.api_key}"}
            ) as websocket:
                # Store websocket connection
                self.ws_connections[session_id] = websocket
                
                # Process incoming messages
                while session["is_active"]:
                    try:
                        msg = await websocket.recv()
                        await self._process_message(session_id, msg)
                    except websockets.exceptions.ConnectionClosed:
                        logger.warning(f"WebSocket connection closed for session {session_id}")
                        break
                    except Exception as e:
                        logger.error(f"Error processing WebSocket message: {e}")
                        continue
        except Exception as e:
            logger.error(f"Error connecting to Deepgram WebSocket: {e}")
            
        # Clean up WebSocket connection
        if session_id in self.ws_connections:
            del self.ws_connections[session_id]
            
    async def _process_message(self, session_id: str, message: str) -> None:
        """Process a message from the Deepgram WebSocket"""
        if session_id not in self.sessions:
            return
            
        session = self.sessions[session_id]
        
        try:
            data = json.loads(message)
            
            # Check if this is a transcription result
            if "channel" in data and "alternatives" in data["channel"]:
                alternatives = data["channel"]["alternatives"]
                
                # Process each alternative transcription
                for alternative in alternatives:
                    transcript = alternative.get("transcript", "")
                    is_final = data.get("is_final", False)
                    confidence = alternative.get("confidence", 0.0)
                    
                    # Extract speaker information if available
                    speaker_id = None
                    start_time = None
                    end_time = None
                    word_count = 0
                    
                    if "words" in alternative and len(alternative["words"]) > 0:
                        words = alternative["words"]
                        word_count = len(words)
                        # Use the speaker from the first word (should be consistent in a single utterance)
                        if "speaker" in words[0]:
                            speaker_id = str(words[0]["speaker"])
                        
                        # Extract timing information if available
                        if "start" in words[0] and "end" in words[-1]:
                            start_time = words[0]["start"]
                            end_time = words[-1]["end"]
                    
                    # Create transcription result object
                    result = {
                        "text": transcript,
                        "is_final": is_final,
                        "session_id": session_id,
                        "timestamp": time.time(),
                        "speaker_id": speaker_id,
                        "speaker_name": f"Speaker {speaker_id}" if speaker_id else None,
                        "confidence": confidence,
                        "start_time": start_time,
                        "end_time": end_time
                    }
                    
                    # Save to database if it's a final transcription
                    if is_final and transcript.strip():
                        try:
                            # Save transcription
                            transcription_repository.save_transcription(
                                session_id=session_id,
                                text=transcript,
                                is_final=is_final,
                                speaker_id=speaker_id,
                                speaker_name=result["speaker_name"],
                                confidence=confidence,
                                start_time=start_time,
                                end_time=end_time
                            )
                            
                            # Update speaker statistics if available
                            if speaker_id:
                                talk_time = (end_time - start_time) if (end_time and start_time) else 0
                                speaker_repository.save_speaker(
                                    session_id=session_id,
                                    speaker_id=speaker_id,
                                    name=result["speaker_name"],
                                    word_count=word_count,
                                    talk_time=talk_time
                                )
                        except Exception as e:
                            logger.error(f"Error saving transcription to database: {e}")
                    
                    # Trigger callbacks with the result
                    await self.callback_manager.trigger_callbacks(session_id, result)
                    
                    # If this is a final result, append to the final transcript
                    if is_final and transcript.strip():
                        if session["final_transcript"]:
                            session["final_transcript"] += " " + transcript
                        else:
                            session["final_transcript"] = transcript
        
        except json.JSONDecodeError:
            logger.error(f"Failed to decode Deepgram message: {message}")
        except Exception as e:
            logger.error(f"Error processing Deepgram message: {e}")
    
    async def process_audio_chunk(self, session_id: str, audio_chunk: bytes) -> Optional[Dict[str, Any]]:
        """Process an audio chunk in a streaming session"""
        if session_id not in self.sessions or session_id not in self.ws_connections:
            return None
        
        try:
            # Send audio data to Deepgram
            await self.ws_connections[session_id].send(audio_chunk)
            
            # Return a status update
            return {
                "status": "processing",
                "session_id": session_id
            }
            
        except Exception as e:
            logger.error(f"Error sending audio chunk: {e}")
            return {
                "status": "error",
                "error": str(e),
                "session_id": session_id
            }
    
    async def end_session(self, session_id: str) -> Dict[str, Any]:
        """End a transcription session and get final results"""
        if session_id not in self.sessions:
            return {"error": "Session not found"}
        
        session = self.sessions[session_id]
        session["is_active"] = False
        
        # Close WebSocket connection if open
        if session_id in self.ws_connections:
            try:
                await self.ws_connections[session_id].close()
            except:
                pass
        
        # Create final result
        final_result = {
            "session_id": session_id,
            "text": session["final_transcript"],
            "chunks": session["chunks"],
            "language": session["language"],
            "duration": time.time() - session["start_time"],
            "is_final": True,
            "speakers": list(session["speakers"].values())
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
        
    async def transcribe_audio(self, audio_data: bytes, language: str = "en") -> Dict[str, Any]:
        """Transcribe complete audio file using Deepgram's API"""
        if not self.api_key:
            logger.warning("Deepgram API key not set, transcription will fail")
            return {"error": "API key not set", "text": "[Transcription unavailable]"}
        
        try:
            # Set up headers for API request
            headers = {
                "Authorization": f"Token {self.api_key}",
                "Content-Type": "audio/wav"
            }
            
            # Prepare parameters
            params = {
                "punctuate": "true",
                "diarize": "true",
                "language": language,
                "model": "nova-2",
                "smart_format": "true",
                "utterances": "true"
            }
            
            # Make the API request
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.deepgram.com/v1/listen",
                    params=params,
                    headers=headers,
                    data=audio_data
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return {"error": f"Transcription failed: {error_text}", "text": "[Transcription failed]"}
                    
                    result = await response.json()
                    
                    # Process the response
                    if "results" in result and "channels" in result["results"]:
                        channels = result["results"]["channels"]
                        if channels and "alternatives" in channels[0]:
                            alternatives = channels[0]["alternatives"]
                            if alternatives and "transcript" in alternatives[0]:
                                transcript = alternatives[0]["transcript"]
                                
                                # Process speaker diarization if available
                                speakers = {}
                                if "speaker_labels" in result["results"]:
                                    for speaker in result["results"]["speaker_labels"]:
                                        speaker_id = speaker["speaker"]
                                        if speaker_id not in speakers:
                                            speakers[speaker_id] = {
                                                "id": speaker_id,
                                                "label": f"Speaker {speaker_id}",
                                                "word_count": 0,
                                                "talk_time": 0
                                            }
                                        
                                        # Update word count
                                        words = len(speaker["words"])
                                        speakers[speaker_id]["word_count"] += words
                                        speakers[speaker_id]["talk_time"] += speaker["end"] - speaker["start"]
                                
                                return {
                                    "text": transcript,
                                    "language": language,
                                    "is_final": True,
                                    "speakers": list(speakers.values())
                                }
            
            return {"error": "Failed to process transcription result", "text": "[Processing failed]"}
        
        except Exception as e:
            logger.error(f"Error in transcribe_audio: {e}")
            return {"error": str(e), "text": "[Processing error]"}

# Create a singleton instance
transcription_service = DeepgramTranscriptionService()
