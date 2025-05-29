#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Socket.IO Connection Manager for Clarimeet

Manages Socket.IO connections and provides utilities for sending and receiving messages.
"""

import logging
import asyncio
import uuid
import time
import os
import json
import socketio
from typing import Dict, List, Optional, Any, Set, Callable

# Import API-based services with free tiers
from app.utils.deepgram_transcription import DeepgramTranscriptionService, transcription_service
from app.utils.gemini_services import GeminiSummarizationService, summarization_service, chat_service

# Import OpenAI for chat responses
try:
    import openai
    OPENAI_AVAILABLE = bool(os.environ.get("OPENAI_API_KEY"))
    if OPENAI_AVAILABLE:
        openai.api_key = os.environ.get("OPENAI_API_KEY")
        CHAT_MODEL = "gpt-3.5-turbo"
except ImportError:
    OPENAI_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create a Socket.IO AsyncServer instance with more secure CORS settings
# Get allowed origins from environment or use safe defaults
def get_allowed_origins():
    # In development, allow all origins if explicitly set in environment
    if os.environ.get('ENVIRONMENT', '').lower() == 'development' and os.environ.get('ALLOW_ALL_ORIGINS', '').lower() == 'true':
        return '*'
    
    # Otherwise, use a list of allowed origins
    origins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
    ]
    
    # Add any additional origins from environment
    additional_origins = os.environ.get('ALLOWED_ORIGINS', '')
    if additional_origins:
        origins.extend([origin.strip() for origin in additional_origins.split(',')])
    
    return origins

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=get_allowed_origins(),
    logger=True,
    engineio_logger=True
)

class SocketIOManager:
    """
    Manages Socket.IO connections and communications.
    
    Provides functionality for:
    - Tracking client connections
    - Managing room memberships
    - Sending messages to clients
    """
    
    def __init__(self, sio_instance: socketio.AsyncServer):
        """
        Initialize the Socket.IO manager.
        
        Args:
            sio_instance: The Socket.IO server instance
        """
        self.sio = sio_instance
        self.sid_to_client_id: Dict[str, str] = {}  # Maps Socket.IO session IDs to client IDs
        self.client_id_to_sid: Dict[str, str] = {}  # Maps client IDs to Socket.IO session IDs
        self.sid_to_session_id: Dict[str, str] = {}  # Maps Socket.IO session IDs to session IDs (rooms)
        self.session_clients: Dict[str, Set[str]] = {}  # Maps session IDs to sets of client IDs
        
        # Map of client IDs to session IDs
        self._client_sessions: Dict[str, str] = {}
        
        # Map of session IDs to sets of client IDs
        self._session_clients: Dict[str, set] = {}
        
        # Map of Socket.IO SIDs to client IDs
        self._sid_clients: Dict[str, str] = {}
        
        # Map of session IDs to active transcription processes
        self._active_transcriptions: Dict[str, bool] = {}
        
        # Map of session IDs to active summarization processes
        self._active_summarizations: Dict[str, bool] = {}
        
    def set_client_id(self, sid: str, client_id: str) -> None:
        """
        Associate a client ID with a Socket.IO session ID.
        
        Args:
            sid: Socket.IO session ID
            client_id: Client identifier
        """
        self.sid_to_client_id[sid] = client_id
        self.client_id_to_sid[client_id] = sid
        self._sid_clients[sid] = client_id
        logger.info(f"Associated client {client_id} with Socket.IO session {sid}")
    
    def get_client_id(self, sid: str) -> Optional[str]:
        """
        Get the client ID associated with a Socket.IO session ID.
        
        Args:
            sid: Socket.IO session ID
            
        Returns:
            The client ID if found, None otherwise
        """
        return self.sid_to_client_id.get(sid)
    
    def get_sid(self, client_id: str) -> Optional[str]:
        """
        Get the Socket.IO session ID associated with a client ID.
        
        Args:
            client_id: Client identifier
            
        Returns:
            The Socket.IO session ID if found, None otherwise
        """
        return self.client_id_to_sid.get(client_id)
    
    async def join_session(self, client_id: str, session_id: str) -> None:
        """
        Join a client to a session.
        
        Args:
            client_id: Client identifier
            session_id: Session identifier (room name)
        """
        logger.info(f"Client {client_id} joining session {session_id}")
        
        # If client was in another session, remove from it
        if client_id in self._client_sessions:
            old_session_id = self._client_sessions[client_id]
            if old_session_id in self._session_clients:
                self._session_clients[old_session_id].discard(client_id)
        
        # Add client to new session
        self._client_sessions[client_id] = session_id
        
        # Initialize session client set if needed
        if session_id not in self._session_clients:
            self._session_clients[session_id] = set()
        
        # Add client to session set
        self._session_clients[session_id].add(client_id)
        
        logger.info(f"Client {client_id} joined session {session_id}")
        logger.info(f"Session {session_id} now has clients: {self._session_clients[session_id]}")
        
        # Start real services for the session if not already running
        await self._ensure_real_services(session_id)
    
    async def _ensure_real_services(self, session_id: str) -> None:
        """
        Ensure real transcription and summarization services are running for a session.
        Uses free local services instead of paid API services.
        
        Args:
            session_id: Session identifier (room name)
        """
        # Check if transcription is already active for this session
        if session_id not in self._active_transcriptions or not self._active_transcriptions[session_id]:
            # Start a new transcription session
            await transcription_service.start_session(session_id)
            
            # Register callback for transcription updates
            async def transcription_callback(data):
                # Send transcription update to all clients in the session
                await self.emit_to_session(session_id, "transcription_update", data)
                
                # Also feed transcript to summarization service if active
                if session_id in self._active_summarizations and self._active_summarizations[session_id]:
                    if "text" in data and data.get("is_final", False) == False:
                        summary_session = summarization_service.get_session(session_id)
                        if summary_session:
                            summary_session.add_transcript(data["text"])
            
            # Register the callback with the transcription service
            await transcription_service.register_callback(session_id, transcription_callback)
            
            # Mark transcription as active for this session
            self._active_transcriptions[session_id] = True
            
            logger.info(f"Started free transcription service for session {session_id}")
        
        # Check if summarization is already active for this session
        if session_id not in self._active_summarizations or not self._active_summarizations[session_id]:
            try:
                # Create a new summarization session
                summary_session = summarization_service.create_session(session_id)
                
                # Register callback for summarization updates
                def summarization_callback(data):
                    # Use asyncio.create_task to run the async emit in a background task
                    asyncio.create_task(self.emit_to_session(session_id, "summary_update", data))
                
                # Add the callback to the summarization session
                summary_session.add_callback(summarization_callback)
                
                # Start the summarization session
                summary_session.start()
                
                # Mark summarization as active for this session
                self._active_summarizations[session_id] = True
                
                logger.info(f"Started free summarization service for session {session_id}")
            except Exception as e:
                logger.error(f"Error starting summarization service: {e}")
            # Fallback to simple operation if services fail
            logger.info(f"Services may not be fully functional for session {session_id}")
    
    async def leave_session(self, client_id: str) -> None:
        """
        Remove a client from its session.
        
        Args:
            client_id: Client identifier
        """
        if client_id in self._client_sessions:
            session_id = self._client_sessions[client_id]
            
            # Remove from session clients
            if session_id in self._session_clients:
                self._session_clients[session_id].discard(client_id)
                
                # If session is empty, clean up and stop mock services
                if not self._session_clients[session_id]:
                    await self._cleanup_session(session_id)
                    del self._session_clients[session_id]
            
            # Remove from client sessions
            del self._client_sessions[client_id]
            
            logger.info(f"Client {client_id} left session {session_id}")
    
    async def _cleanup_session(self, session_id: str) -> None:
        """
        Clean up resources for a session when all clients have left.
        
        Args:
            session_id: Session identifier (room name)
        """
        try:
            # Stop transcription service if running
            if session_id in self._active_transcriptions:
                try:
                    # If we have structured data with callback_id
                    if isinstance(self._active_transcriptions[session_id], dict):
                        callback_id = self._active_transcriptions[session_id].get("callback_id")
                        if callback_id:
                            await transcription_service.unregister_callback(session_id, callback_id)
                    
                    # End the transcription session
                    result = await transcription_service.end_session(session_id)
                    logger.info(f"Stopped transcription service for session {session_id}: {result}")
                    
                    # Clean up our tracking
                    del self._active_transcriptions[session_id]
                except Exception as e:
                    logger.error(f"Error stopping transcription service: {e}")
            
            # Stop summarization service if running
            if session_id in self._active_summarizations:
                try:
                    # Close the summarization session
                    summarization_service.close_session(session_id)
                    logger.info(f"Stopped summarization service for session {session_id}")
                    
                    # Clean up our tracking
                    del self._active_summarizations[session_id]
                except Exception as e:
                    logger.error(f"Error stopping summarization service: {e}")
        except Exception as e:
            logger.error(f"Error in session cleanup: {e}")
    
    async def disconnect_client(self, sid: str) -> None:
        """
        Handle client disconnection.
        
        Args:
            sid: Socket.IO session ID
        """
        client_id = self._sid_clients.get(sid)
        if client_id:
            await self.leave_session(client_id)
            del self._sid_clients[sid]
            logger.info(f"Client {client_id} disconnected")
    
    def get_session_clients(self, session_id: str) -> List[str]:
        """
        Get all client IDs in a session.
        
        Args:
            session_id: Session identifier (room name)
        
        Returns:
            List of client IDs in the session
        """
        return list(self._session_clients.get(session_id, set()))
    
    def get_client_session(self, client_id: str) -> Optional[str]:
        """
        Get the session ID a client is in.
        
        Args:
            client_id: Client identifier
        
        Returns:
            The session ID if found, None otherwise
        """
        return self._client_sessions.get(client_id)
    
    def get_client_sid(self, client_id: str) -> Optional[str]:
        """
        Get the Socket.IO session ID for a client ID.
        
        Args:
            client_id: Client identifier
            
        Returns:
            The Socket.IO session ID if found, None otherwise
        """
        for sid, cid in self._sid_clients.items():
            if cid == client_id:
                return sid
        return None
    
    async def emit_to_session(self, session_id: str, event: str, data: Any) -> None:
        """
        Emit an event to all clients in a session.
        
        Args:
            session_id: Session identifier (room name)
            event: Event name
            data: Data to send
        """
        if not self.sio:
            logger.error("Socket.IO server not set")
            return
        
        clients = self.get_session_clients(session_id)
        logger.debug(f"Emitting {event} to session {session_id} with {len(clients)} clients")
        
        for client_id in clients:
            sid = self.get_client_sid(client_id)
            if sid:
                try:
                    await self.sio.emit(event, data, room=sid)
                    logger.debug(f"Emitted {event} to client {client_id} (SID: {sid})")
                except Exception as e:
                    logger.error(f"Error emitting to client {client_id}: {e}")
    
    async def emit_to_client(self, client_id: str, event: str, data: Any) -> None:
        """
        Emit an event to a specific client.
        
        Args:
            client_id: Client identifier
            event: Event name
            data: Data to send
        """
        if not self.sio:
            logger.error("Socket.IO server not set")
            return
        
        sid = self.get_client_sid(client_id)
        if sid:
            try:
                await self.sio.emit(event, data, room=sid)
                logger.debug(f"Emitted {event} to client {client_id} (SID: {sid})")
            except Exception as e:
                logger.error(f"Error emitting to client {client_id}: {e}")
        else:
            logger.warning(f"No SID found for client {client_id}")
    
    async def handle_chat_message(self, session_id: str, client_id: str, message: str) -> None:
        """
        Handle a chat message from a client and generate a response using the free chat service.
        
        Args:
            session_id: Session identifier (room name)
            client_id: Client identifier
            message: Message content
        """
        try:
            logger.info(f"Handling chat message from {client_id} in session {session_id}: {message}")
            
            # Get the current transcript and summary if available for context
            transcript = ""
            summary = None
            
            # Get session data if available
            if session_id in self._active_transcriptions and self._active_transcriptions[session_id]:
                # In a real implementation, we would have a better way to get the latest transcript
                # For now, we'll just use an empty string or retrieve from storage in a production system
                pass
                
            if session_id in self._active_summarizations and self._active_summarizations[session_id]:
                # Get the latest summary if available
                summary_session = summarization_service.get_session(session_id)
                if summary_session:
                    # In a real implementation, we would have a way to get the latest summary
                    # For now, we'll just pass an empty summary
                    pass
            
            # Generate a response using our free chat service
            response = await chat_service.generate_response(
                session_id=session_id,
                message=message,
                transcript=transcript,
                summary=summary
            )
            
            # Create the response object
            response_obj = {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "from": "assistant",
                "to": "all",
                "message": response,
                "timestamp": time.time()
            }
            
            # Send the response to all clients in the session
            await self.emit_to_session(session_id, "chat_message", response_obj)
            
            logger.info(f"Sent chat response to session {session_id}")
            
        except Exception as e:
            logger.error(f"Error handling chat message: {e}")
            # Send an error response
            error_response = {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "from": "system",
                "to": client_id,
                "message": "Sorry, I encountered an error processing your message.",
                "timestamp": time.time()
            }
            await self.emit_to_session(session_id, "chat_message", error_response)
    
    async def _generate_chat_response(self, message: str, session_id: str) -> str:
        """
        Generate a response to a chat message using OpenAI if available.
        
        Args:
            message: Message content


# Create a singleton instance
socketio_manager = SocketIOManager(sio)
