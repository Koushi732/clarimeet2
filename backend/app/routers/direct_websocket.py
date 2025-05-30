#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Direct WebSocket Router for Clarimeet

Implements a simplified WebSocket endpoint for direct communication with clients.
This provides a more reliable alternative to Socket.IO for real-time features.
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
router = APIRouter(prefix="/direct", tags=["direct_websocket"])

# Dictionary to track active websocket connections
active_connections = {}

# Dictionary to track active sessions
active_sessions = {}

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None)
):
    """
    Direct WebSocket connection endpoint that handles all message types.
    
    Args:
        websocket: WebSocket connection
        client_id: Optional client identifier; if not provided, a UUID will be generated
        session_id: Optional session ID to connect to immediately
    """
    # Generate a client ID if not provided
    if not client_id:
        client_id = str(uuid.uuid4())
    
    logger.info(f"Direct WebSocket connection attempt from client {client_id}")
    
    # Accept the connection
    await websocket.accept()
    logger.info(f"Direct WebSocket connection accepted for client {client_id}")
    
    # Store the connection
    active_connections[client_id] = websocket
    
    # If session_id is provided, add this connection to that session
    if session_id:
        if session_id not in active_sessions:
            active_sessions[session_id] = []
        active_sessions[session_id].append(client_id)
        logger.info(f"Client {client_id} joined session {session_id}")
    
    # Send welcome message
    await send_message(websocket, "connection_status", {
        "status": "connected",
        "client_id": client_id,
        "message": "Connected to Clarimeet Direct WebSocket API"
    })
    
    # Main message processing loop
    try:
        while True:
            # Wait for a message
            message = await websocket.receive_text()
            
            try:
                # Parse the message
                data = json.loads(message)
                event = data.get("event", "message")
                payload = data.get("data", {})
                
                logger.info(f"Received message from client {client_id}: event={event}")
                
                # Process different message types
                if event == "ping":
                    # Respond to ping messages
                    await send_message(websocket, "pong", {"timestamp": payload.get("timestamp")})
                
                elif event == "join_session":
                    # Handle join session request
                    new_session_id = payload.get("session_id")
                    if new_session_id:
                        # Add to new session
                        if new_session_id not in active_sessions:
                            active_sessions[new_session_id] = []
                        if client_id not in active_sessions[new_session_id]:
                            active_sessions[new_session_id].append(client_id)
                        
                        # Remove from old session if applicable
                        if session_id and session_id != new_session_id:
                            if session_id in active_sessions and client_id in active_sessions[session_id]:
                                active_sessions[session_id].remove(client_id)
                        
                        # Update current session_id
                        session_id = new_session_id
                        
                        logger.info(f"Client {client_id} joined session {session_id}")
                        
                        # Notify client
                        await send_message(websocket, "join_response", {
                            "status": "success",
                            "session_id": session_id
                        })
                
                elif event == "audio_chunk":
                    # Process audio chunk for transcription
                    if not session_id:
                        # Need a session ID for audio processing
                        await send_message(websocket, "error", {
                            "message": "Cannot process audio without a session ID",
                            "code": "NO_SESSION"
                        })
                        continue
                    
                    # Process the audio data
                    try:
                        # Extract audio data
                        audio_data = payload
                        
                        # If audio is base64 encoded
                        if isinstance(audio_data, dict) and "audio" in audio_data:
                            # Decode base64 audio
                            audio_bytes = base64.b64decode(audio_data["audio"])
                        else:
                            # Handle binary audio data
                            audio_bytes = message.encode() if isinstance(message, str) else message
                        
                        # Process audio through our transcription service
                        result = await process_audio_chunk(session_id, audio_bytes)
                        
                        if result:
                            # Send the result to the client
                            await send_message(websocket, "transcription_update", result)
                            
                            # Also broadcast to other clients in the same session
                            await broadcast_to_session(session_id, client_id, "transcription_update", result)
                    
                    except Exception as e:
                        logger.error(f"Error processing audio: {e}")
                        await send_message(websocket, "error", {
                            "message": f"Error processing audio: {str(e)}",
                            "code": "AUDIO_PROCESSING_ERROR"
                        })
                
                elif event == "chat_message":
                    # Handle chat messages
                    if not session_id:
                        # Need a session ID for chat
                        await send_message(websocket, "error", {
                            "message": "Cannot send chat messages without a session ID",
                            "code": "NO_SESSION"
                        })
                        continue
                    
                    # Add client_id to the message data
                    payload["client_id"] = client_id
                    
                    # Broadcast to all clients in the session
                    await broadcast_to_session(session_id, None, "chat_message", payload)
                
                else:
                    # Handle unknown message types
                    logger.warning(f"Unknown message type from client {client_id}: {event}")
                    await send_message(websocket, "error", {
                        "message": f"Unknown message type: {event}",
                        "code": "UNKNOWN_MESSAGE_TYPE"
                    })
            
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON from client {client_id}")
                await send_message(websocket, "error", {
                    "message": "Invalid JSON message",
                    "code": "INVALID_JSON"
                })
            
            except Exception as e:
                logger.error(f"Error processing message from client {client_id}: {e}")
                await send_message(websocket, "error", {
                    "message": f"Error processing message: {str(e)}",
                    "code": "PROCESSING_ERROR"
                })
    
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    
    except Exception as e:
        logger.error(f"Unexpected error in WebSocket connection for client {client_id}: {e}")
    
    finally:
        # Clean up connection
        if client_id in active_connections:
            del active_connections[client_id]
        
        # Remove from any sessions
        for sess_id, clients in active_sessions.items():
            if client_id in clients:
                clients.remove(client_id)
        
        logger.info(f"Cleaned up connection for client {client_id}")

async def send_message(websocket: WebSocket, event: str, data: Any):
    """
    Send a message to a WebSocket client.
    
    Args:
        websocket: The WebSocket connection
        event: Event type
        data: Message data
    """
    try:
        message = json.dumps({"event": event, "data": data})
        await websocket.send_text(message)
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        raise

async def broadcast_to_session(session_id: str, exclude_client_id: Optional[str], event: str, data: Any):
    """
    Broadcast a message to all clients in a session.
    
    Args:
        session_id: The session ID
        exclude_client_id: Optional client ID to exclude from broadcast
        event: Event type
        data: Message data
    """
    if session_id not in active_sessions:
        return
    
    message = json.dumps({"event": event, "data": data})
    
    for client_id in active_sessions[session_id]:
        # Skip excluded client
        if exclude_client_id and client_id == exclude_client_id:
            continue
        
        # Get the client's WebSocket
        websocket = active_connections.get(client_id)
        if websocket:
            try:
                await websocket.send_text(message)
            except Exception as e:
                logger.error(f"Error broadcasting to client {client_id}: {e}")
