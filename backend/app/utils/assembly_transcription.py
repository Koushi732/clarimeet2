#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
AssemblyAI Transcription Service for Clarimeet

Provides real-time transcription using AssemblyAI's free tier API.
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set API key from environment variable or use placeholder
ASSEMBLY_API_KEY = os.environ.get("ASSEMBLY_API_KEY", "")

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

class AssemblyAITranscriptionService:
    """Transcription service using AssemblyAI's API (free tier)"""
    
    def __init__(self):
        self.api_key = ASSEMBLY_API_KEY
        self.callback_manager = CallbackManager()
        self.sessions = {}
        self.ws_connections = {}
        
    async def start_session(self, session_id: str, language: str = "en") -> None:
        """Start a new transcription session"""
        if not self.api_key:
            logger.warning("AssemblyAI API key not set, transcription will be limited")
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
        logger.info(f"Started AssemblyAI transcription session {session_id}")
        
    async def _connect_websocket(self, session_id: str) -> None:
        """Connect to AssemblyAI's real-time WebSocket API"""
        if session_id not in self.sessions:
            return
            
        session = self.sessions[session_id]
        auth_header = {"Authorization": self.api_key}
        
        # Configure real-time transcription with speaker diarization
        config = {
            "word_boost": ["meeting", "agenda", "action", "item", "discussion"],
            "language_code": session["language"],
            "punctuate": True,
            "format_text": True,
            "speaker_labels": True,  # Enable speaker diarization
            "speech_threshold": 0.2,
            "sample_rate": 16000
        }
        
        try:
            # Connect to AssemblyAI's real-time API
            async with websockets.connect(
                'wss://api.assemblyai.com/v2/realtime/ws',
                extra_headers=auth_header
            ) as websocket:
                # Store websocket connection
                self.ws_connections[session_id] = websocket
                
                # Send configuration
                await websocket.send(json.dumps({"type": "ConnectionConfig", "config": config}))
                
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
            logger.error(f"Error connecting to AssemblyAI WebSocket: {e}")
            
        # Clean up WebSocket connection
        if session_id in self.ws_connections:
            del self.ws_connections[session_id]
            
    async def _process_message(self, session_id: str, message: str) -> None:
        """Process a message from the AssemblyAI WebSocket"""
        if session_id not in self.sessions:
            return
            
        session = self.sessions[session_id]
        
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "SessionBegins":
                logger.info(f"AssemblyAI session began for {session_id}")
                
            elif message_type == "PartialTranscript":
                # Process partial (non-final) transcripts
                transcript = data.get("text", "")
                
                # Create update data
                update = {
                    "session_id": session_id,
                    "text": transcript,
                    "is_final": False,
                    "language": session["language"],
                }
                
                # Add speaker info if available
                if "speaker" in data:
                    update["speaker"] = f"Speaker {data['speaker']}"
                
                # Store chunk and trigger callbacks
                session["chunks"].append(update)
                await self.callback_manager.trigger_callbacks(session_id, update)
                
            elif message_type == "FinalTranscript":
                # Process final transcripts
                transcript = data.get("text", "")
                
                # Only process if there's actual content
                if transcript.strip():
                    # Create update data
                    update = {
                        "session_id": session_id,
                        "text": transcript,
                        "is_final": True,
                        "language": session["language"],
                    }
                    
                    # Add speaker info if available
                    if "speaker" in data:
                        speaker_id = data["speaker"]
                        update["speaker"] = f"Speaker {speaker_id}"
                        
                        # Update speaker statistics
                        if speaker_id not in session["speakers"]:
                            session["speakers"][speaker_id] = {
                                "id": speaker_id,
                                "label": f"Speaker {speaker_id}",
                                "word_count": 0,
                                "talk_time": 0
                            }
                        
                        # Update word count (approximate)
                        words = len(transcript.split())
                        session["speakers"][speaker_id]["word_count"] += words
                        
                        # Approximate talk time (average 2 words per second)
                        session["speakers"][speaker_id]["talk_time"] += words / 2
                    
                    # Append to final transcript
                    if session["final_transcript"]:
                        session["final_transcript"] += " " + transcript
                    else:
                        session["final_transcript"] = transcript
                    
                    # Store chunk and trigger callbacks
                    session["chunks"].append(update)
                    await self.callback_manager.trigger_callbacks(session_id, update)
            
            elif message_type == "SessionTerminated":
                logger.info(f"AssemblyAI session terminated for {session_id}")
                
        except json.JSONDecodeError:
            logger.error(f"Failed to decode AssemblyAI message: {message}")
        except Exception as e:
            logger.error(f"Error processing AssemblyAI message: {e}")
    
    async def process_audio_chunk(self, session_id: str, audio_chunk: bytes) -> Optional[Dict[str, Any]]:
        """Process an audio chunk in a streaming session"""
        if session_id not in self.sessions or session_id not in self.ws_connections:
            return None
        
        try:
            # Base64 encode the audio data
            audio_base64 = base64.b64encode(audio_chunk).decode('utf-8')
            
            # Send audio data to AssemblyAI
            await self.ws_connections[session_id].send(json.dumps({
                "type": "AudioData",
                "data": audio_base64
            }))
            
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
        """Transcribe complete audio file using AssemblyAI's API"""
        if not self.api_key:
            logger.warning("AssemblyAI API key not set, transcription will fail")
            return {"error": "API key not set", "text": "[Transcription unavailable]"}
        
        try:
            # First upload the audio file
            headers = {
                "authorization": self.api_key,
                "content-type": "application/json"
            }
            
            # Upload the file
            async with aiohttp.ClientSession() as session:
                # Get upload URL
                async with session.post(
                    "https://api.assemblyai.com/v2/upload",
                    headers=headers,
                    data=audio_data
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return {"error": f"Upload failed: {error_text}", "text": "[Upload failed]"}
                    
                    upload_response = await response.json()
                    audio_url = upload_response.get("upload_url")
                    
                    if not audio_url:
                        return {"error": "Failed to get upload URL", "text": "[Upload failed]"}
                
                # Submit transcription request
                transcript_config = {
                    "audio_url": audio_url,
                    "language_code": language,
                    "speaker_labels": True,
                    "punctuate": True,
                    "format_text": True
                }
                
                async with session.post(
                    "https://api.assemblyai.com/v2/transcript",
                    json=transcript_config,
                    headers=headers
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return {"error": f"Transcription request failed: {error_text}", "text": "[Transcription failed]"}
                    
                    transcript_response = await response.json()
                    transcript_id = transcript_response.get("id")
                    
                    if not transcript_id:
                        return {"error": "Failed to get transcript ID", "text": "[Transcription failed]"}
                
                # Poll for completion
                polling_endpoint = f"https://api.assemblyai.com/v2/transcript/{transcript_id}"
                
                while True:
                    await asyncio.sleep(3)  # Poll every 3 seconds
                    
                    async with session.get(polling_endpoint, headers=headers) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            return {"error": f"Polling failed: {error_text}", "text": "[Transcription failed]"}
                        
                        polling_response = await response.json()
                        status = polling_response.get("status")
                        
                        if status == "completed":
                            # Process successful transcription
                            speakers = {}
                            for utterance in polling_response.get("utterances", []):
                                speaker_id = utterance.get("speaker")
                                if speaker_id not in speakers:
                                    speakers[speaker_id] = {
                                        "id": speaker_id,
                                        "label": f"Speaker {speaker_id}",
                                        "word_count": 0,
                                        "talk_time": 0
                                    }
                                
                                # Update word count
                                words = len(utterance.get("text", "").split())
                                speakers[speaker_id]["word_count"] += words
                                speakers[speaker_id]["talk_time"] += words / 2
                            
                            return {
                                "text": polling_response.get("text", ""),
                                "language": language,
                                "is_final": True,
                                "speakers": list(speakers.values()),
                                "words": polling_response.get("words", [])
                            }
                        
                        elif status == "error":
                            return {
                                "error": polling_response.get("error", "Unknown error"),
                                "text": "[Transcription error]"
                            }
                        
                        # Continue polling if still processing
        
        except Exception as e:
            logger.error(f"Error in transcribe_audio: {e}")
            return {"error": str(e), "text": "[Processing error]"}

# Create a singleton instance
transcription_service = AssemblyAITranscriptionService()
