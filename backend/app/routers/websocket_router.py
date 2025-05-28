#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
WebSocket Router for Clariimeet

Implements WebSocket endpoints for real-time communication with clients,
including transcription updates, summarization updates, and status notifications.
"""

import asyncio
import json
import logging
import uuid
import base64
import tempfile
import os
from typing import Dict, List, Optional, Any, Union

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi import status, Query, Path
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Session as SessionModel
from ..utils.connection_manager import connection_manager
from ..utils.transcription_service import process_audio_chunk, start_transcription, stop_transcription

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/ws", tags=["websockets"])

# Dictionary to track active transcription sessions
active_transcription_sessions = {}

# Dictionary to track audio processing sessions
audio_processing_sessions = {}

@router.websocket("/session/{session_id}/connect")
async def connect_session(websocket: WebSocket, session_id: str, client_id: Optional[str] = None):
    """
    Connect a client to a session's WebSocket stream.
    
    Args:
        websocket: WebSocket connection
        session_id: ID of the session to connect to
        client_id: Optional client identifier; if not provided, a UUID will be generated
        
    Raises:
        WebSocketDisconnect: When the client disconnects
    """
    # Generate a client ID if not provided
    if not client_id:
        client_id = str(uuid.uuid4())
    
    # Accept the connection and register it with the connection manager
    await connection_manager.connect(client_id, websocket)
    
    try:
        # Send initial status
        await connection_manager.send_message(
            client_id=client_id,
            message_type="connection_status",
            data={"status": "connected", "session_id": session_id}
        )
        
        # Main message processing loop
        while True:
            try:
                # Receive and process messages from the client
                await connection_manager.receive_and_process(client_id)
            except WebSocketDisconnect:
                # If client disconnects, exit the loop
                logger.info(f"Client {client_id} disconnected from session {session_id}")
                break
            except Exception as e:
                # Log other errors but continue processing
                logger.error(f"Error processing message from {client_id}: {e}")
                # Try to notify the client of the error
                try:
                    await connection_manager.send_message(
                        client_id=client_id,
                        message_type="error",
                        data={"message": f"Error processing message: {str(e)}"}
                    )
                except:
                    # If we can't send the error, the connection might be broken
                    logger.error(f"Failed to send error message to client {client_id}")
                    break
    
    finally:
        # Clean up the connection when the client disconnects
        await connection_manager.disconnect(client_id)
        
        # Remove from active transcription sessions if applicable
        session_key = f"{session_id}_{client_id}"
        if session_key in active_transcription_sessions:
            del active_transcription_sessions[session_key]

@router.websocket("/transcription/{session_id}/live")
async def live_transcription_feed(websocket: WebSocket, session_id: str, client_id: Optional[str] = None):
    """
    Provide a real-time feed of transcription updates for a session.
    
    Args:
        websocket: WebSocket connection
        session_id: ID of the session to stream transcriptions for
        client_id: Optional client identifier; if not provided, a UUID will be generated
        
    Raises:
        WebSocketDisconnect: When the client disconnects
    """
    # Generate a client ID if not provided
    if not client_id:
        client_id = str(uuid.uuid4())
    
    # Session key to track active transcription sessions
    session_key = f"{session_id}_{client_id}"
    
    # Accept the connection and register it with the connection manager
    await connection_manager.connect(client_id, websocket)
    
    try:
        # Start transcription service in a separate task if not already running
        from ..utils.real_time_transcription import WhisperTranscriber
        
        # Register this session as active
        if session_key not in active_transcription_sessions:
            # Create transcriber instance
            transcriber = WhisperTranscriber()
            
            # Define callback to send updates via WebSocket
            async def transcription_callback(result):
                try:
                    await connection_manager.send_message(
                        client_id=client_id,
                        message_type="transcription_update",
                        data=result.dict()
                    )
                except Exception as e:
                    logger.error(f"Error sending transcription update to {client_id}: {e}")
            
            # Start transcription service
            success = transcriber.start_transcription(
                session_id=session_id,
                callback=transcription_callback
            )
            
            if success:
                active_transcription_sessions[session_key] = transcriber
                logger.info(f"Started transcription for session {session_id}, client {client_id}")
            else:
                await connection_manager.send_message(
                    client_id=client_id,
                    message_type="error",
                    data={"message": "Failed to start transcription service"}
                )
        else:
            logger.info(f"Transcription already active for session {session_id}, client {client_id}")
        
        # Send confirmation message
        await connection_manager.send_message(
            client_id=client_id,
            message_type="transcription_status",
            data={"status": "active", "session_id": session_id}
        )
        
        # Main message processing loop
        while True:
            try:
                # Process commands from the client
                await connection_manager.receive_and_process(client_id)
            except WebSocketDisconnect:
                # If client disconnects, exit the loop
                logger.info(f"Client {client_id} disconnected from transcription feed for session {session_id}")
                break
            except Exception as e:
                # Log other errors but continue processing
                logger.error(f"Error in transcription feed for {client_id}: {e}")
                try:
                    await connection_manager.send_message(
                        client_id=client_id,
                        message_type="error",
                        data={"message": f"Error in transcription feed: {str(e)}"}
                    )
                except:
                    # If we can't send the error, the connection might be broken
                    break
    
    finally:
        # Stop transcription if this was the initiating client
        if session_key in active_transcription_sessions:
            transcriber = active_transcription_sessions[session_key]
            transcriber.stop_transcription()
            del active_transcription_sessions[session_key]
            logger.info(f"Stopped transcription for session {session_id}, client {client_id}")
        
        # Clean up the connection
        await connection_manager.disconnect(client_id)

@router.websocket("/summary/{session_id}/updates")
async def summary_updates_feed(websocket: WebSocket, session_id: str, client_id: Optional[str] = None):
    """
    Provide a real-time feed of summarization updates for a session.
    
    Args:
        websocket: WebSocket connection
        session_id: ID of the session to stream summaries for
        client_id: Optional client identifier; if not provided, a UUID will be generated
        
    Raises:
        WebSocketDisconnect: When the client disconnects
    """
    # Generate a client ID if not provided
    if not client_id:
        client_id = str(uuid.uuid4())
    
    # Accept the connection and register it with the connection manager
    await connection_manager.connect(client_id, websocket)
    
    try:
        # Register this client for summary updates
        from ..utils.summarization_service import register_summary_callback
        
        # Define callback to send updates via WebSocket
        async def summary_callback(summary_data):
            try:
                await connection_manager.send_message(
                    client_id=client_id,
                    message_type="summary_update",
                    data=summary_data
                )
            except Exception as e:
                logger.error(f"Error sending summary update to {client_id}: {e}")
        
        # Register the callback
        register_summary_callback(session_id, summary_callback)
        
        # Send confirmation message
        await connection_manager.send_message(
            client_id=client_id,
            message_type="summary_status",
            data={"status": "subscribed", "session_id": session_id}
        )
        
        # Main message processing loop
        while True:
            try:
                # Process commands from the client
                await connection_manager.receive_and_process(client_id)
            except WebSocketDisconnect:
                # If client disconnects, exit the loop
                logger.info(f"Client {client_id} disconnected from summary updates for session {session_id}")
                break
            except Exception as e:
                # Log other errors but continue processing
                logger.error(f"Error in summary updates for {client_id}: {e}")
                try:
                    await connection_manager.send_message(
                        client_id=client_id,
                        message_type="error",
                        data={"message": f"Error in summary updates: {str(e)}"}
                    )
                except:
                    # If we can't send the error, the connection might be broken
                    break
    
    finally:
        # Unregister the callback
        from ..utils.summarization_service import unregister_summary_callback
        unregister_summary_callback(session_id, client_id)
        
        # Clean up the connection
        await connection_manager.disconnect(client_id)

@router.websocket("/audio/{session_id}/stream")
async def audio_stream(websocket: WebSocket, session_id: str, client_id: Optional[str] = None):
    """
    Receive real-time audio data from clients and process it for transcription.
    
    Args:
        websocket: WebSocket connection
        session_id: ID of the session for audio processing
        client_id: Optional client identifier; if not provided, a UUID will be generated
        
    Raises:
        WebSocketDisconnect: When the client disconnects
    """
    # Generate a client ID if not provided
    if not client_id:
        client_id = str(uuid.uuid4())
    
    # Create a session key
    session_key = f"{session_id}_{client_id}"
    
    # Accept the connection and register it with the connection manager
    await connection_manager.connect(client_id, websocket)
    
    # Initialize audio processing for this session
    audio_processing_sessions[session_key] = {
        "session_id": session_id,
        "client_id": client_id,
        "chunks_received": 0,
        "temp_dir": tempfile.mkdtemp(prefix=f"audio_{session_id}_"),
        "active": True
    }
    
    logger.info(f"Started audio streaming for session {session_id} from client {client_id}")
    
    try:
        # Send confirmation of connection
        await connection_manager.send_message(
            client_id=client_id,
            message_type="audio_stream_status",
            data={
                "status": "connected", 
                "session_id": session_id,
                "message": "Ready to receive audio data"
            }
        )
        
        # Main loop for receiving audio chunks
        while True:
            try:
                # Receive message from client
                message = await websocket.receive_json()
                
                # Process audio chunk
                if message.get("type") == "audio_chunk" and session_key in audio_processing_sessions:
                    # Extract audio data
                    audio_data = message.get("data")
                    timestamp = message.get("timestamp", None)
                    
                    if not audio_data:
                        continue
                    
                    # Decode base64 audio data if needed
                    if isinstance(audio_data, str) and audio_data.startswith("data:"):
                        # Extract the base64 part
                        try:
                            audio_data = base64.b64decode(audio_data.split(",")[1])
                        except Exception as e:
                            logger.error(f"Error decoding audio data: {e}")
                            continue
                    
                    # Process the audio chunk
                    chunk_index = audio_processing_sessions[session_key]["chunks_received"]
                    chunk_file = os.path.join(
                        audio_processing_sessions[session_key]["temp_dir"],
                        f"chunk_{chunk_index}.pcm"
                    )
                    
                    # Save audio chunk to temp file
                    with open(chunk_file, "wb") as f:
                        f.write(audio_data)
                    
                    # Process audio chunk with transcription service
                    await process_audio_chunk(session_id, chunk_file, chunk_index, timestamp)
                    
                    # Update chunks received count
                    audio_processing_sessions[session_key]["chunks_received"] += 1
                    
                    # Send acknowledgment
                    if chunk_index % 10 == 0:  # Send ack every 10 chunks to reduce traffic
                        await connection_manager.send_message(
                            client_id=client_id,
                            message_type="audio_chunk_received",
                            data={
                                "chunks_processed": audio_processing_sessions[session_key]["chunks_received"],
                                "session_id": session_id
                            }
                        )
                
                # Handle control messages
                elif message.get("type") == "audio_control":
                    control_action = message.get("action")
                    
                    if control_action == "start":
                        # Start transcription process
                        model = message.get("model", "whisper-small")
                        language = message.get("language", "en")
                        
                        success = await start_transcription(
                            session_id=session_id,
                            audio_path=audio_processing_sessions[session_key]["temp_dir"],
                            model=model,
                            language=language
                        )
                        
                        await connection_manager.send_message(
                            client_id=client_id,
                            message_type="transcription_status",
                            data={
                                "status": "started" if success else "failed",
                                "session_id": session_id
                            }
                        )
                    
                    elif control_action == "stop":
                        # Stop transcription process
                        success = await stop_transcription(session_id)
                        
                        await connection_manager.send_message(
                            client_id=client_id,
                            message_type="transcription_status",
                            data={
                                "status": "stopped" if success else "error",
                                "session_id": session_id
                            }
                        )
            
            except WebSocketDisconnect:
                logger.info(f"Client {client_id} disconnected from audio stream for session {session_id}")
                break
            
            except Exception as e:
                logger.error(f"Error processing audio data from {client_id}: {e}")
                try:
                    await connection_manager.send_message(
                        client_id=client_id,
                        message_type="error",
                        data={"message": f"Error processing audio data: {str(e)}"}
                    )
                except:
                    # If we can't send the error, the connection might be broken
                    break
    
    finally:
        # Clean up resources
        if session_key in audio_processing_sessions:
            # Clean up temp directory
            try:
                temp_dir = audio_processing_sessions[session_key]["temp_dir"]
                if os.path.exists(temp_dir):
                    for file in os.listdir(temp_dir):
                        os.remove(os.path.join(temp_dir, file))
                    os.rmdir(temp_dir)
            except Exception as e:
                logger.error(f"Error cleaning up temp directory: {e}")
            
            # Remove session from tracking
            del audio_processing_sessions[session_key]
        
        # Disconnect client
        await connection_manager.disconnect(client_id)
        logger.info(f"Audio streaming ended for session {session_id} from client {client_id}")

@router.websocket("/system/status")
async def system_status_feed(websocket: WebSocket, client_id: Optional[str] = None):
    """
    Provide a real-time feed of system status updates.
    
    Args:
        websocket: WebSocket connection
        client_id: Optional client identifier; if not provided, a UUID will be generated
        
    Raises:
        WebSocketDisconnect: When the client disconnects
    """
    # Generate a client ID if not provided
    if not client_id:
        client_id = str(uuid.uuid4())
    
    # Accept the connection and register it with the connection manager
    await connection_manager.connect(client_id, websocket)
    
    try:
        # Send initial system status
        await connection_manager.send_message(
            client_id=client_id,
            message_type="system_status",
            data={
                "status": "healthy",
                "active_connections": connection_manager.get_active_connections_count(),
                "active_transcriptions": len(active_transcription_sessions),
                "timestamp": asyncio.get_event_loop().time()
            }
        )
        
        # Periodically send status updates
        while True:
            try:
                # Process any incoming messages
                await connection_manager.receive_and_process(client_id)
                
                # Send status update every 10 seconds
                await asyncio.sleep(10)
                
                # Send updated system status
                await connection_manager.send_message(
                    client_id=client_id,
                    message_type="system_status",
                    data={
                        "status": "healthy",
                        "active_connections": connection_manager.get_active_connections_count(),
                        "active_transcriptions": len(active_transcription_sessions),
                        "timestamp": asyncio.get_event_loop().time()
                    }
                )
            
            except WebSocketDisconnect:
                # If client disconnects, exit the loop
                logger.info(f"Client {client_id} disconnected from system status feed")
                break
            except Exception as e:
                # Log other errors but continue processing
                logger.error(f"Error in system status feed for {client_id}: {e}")
                try:
                    await connection_manager.send_message(
                        client_id=client_id,
                        message_type="error",
                        data={"message": f"Error in system status feed: {str(e)}"}
                    )
                except:
                    # If we can't send the error, the connection might be broken
                    break
    
    finally:
        # Clean up the connection
        await connection_manager.disconnect(client_id)
