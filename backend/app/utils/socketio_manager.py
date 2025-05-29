#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Socket.IO Connection Manager for Clarimeet

Manages Socket.IO connections and provides utilities for sending and receiving messages.
"""

import logging
import json
import asyncio
import os
from typing import Dict, Optional, Any, List, Set
import socketio

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
        
    def set_client_id(self, sid: str, client_id: str) -> None:
        """
        Associate a client ID with a Socket.IO session ID.
        
        Args:
            sid: Socket.IO session ID
            client_id: Client identifier
        """
        self.sid_to_client_id[sid] = client_id
        self.client_id_to_sid[client_id] = sid
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
    
    def join_room(self, sid: str, session_id: str) -> None:
        """
        Add a client to a session room.
        
        Args:
            sid: Socket.IO session ID
            session_id: Session identifier (room name)
        """
        asyncio.create_task(self.sio.enter_room(sid, session_id))
        self.sid_to_session_id[sid] = session_id
        
        client_id = self.get_client_id(sid)
        if client_id:
            if session_id not in self.session_clients:
                self.session_clients[session_id] = set()
            self.session_clients[session_id].add(client_id)
            
        logger.info(f"Client {client_id} joined session {session_id}")
    
    def leave_room(self, sid: str, session_id: Optional[str] = None) -> None:
        """
        Remove a client from a session room.
        
        Args:
            sid: Socket.IO session ID
            session_id: Session identifier (room name), if None, will use the stored session ID
        """
        if session_id is None:
            session_id = self.sid_to_session_id.get(sid)
            
        if not session_id:
            return
            
        asyncio.create_task(self.sio.leave_room(sid, session_id))
        
        client_id = self.get_client_id(sid)
        if client_id and session_id in self.session_clients:
            self.session_clients[session_id].discard(client_id)
            if not self.session_clients[session_id]:
                del self.session_clients[session_id]
                
        if sid in self.sid_to_session_id:
            del self.sid_to_session_id[sid]
            
        logger.info(f"Client {client_id} left session {session_id}")
    
    def get_session_id(self, sid: str) -> Optional[str]:
        """
        Get the session ID associated with a Socket.IO session ID.
        
        Args:
            sid: Socket.IO session ID
            
        Returns:
            The session ID if found, None otherwise
        """
        return self.sid_to_session_id.get(sid)
    
    def get_session_clients(self, session_id: str) -> List[str]:
        """
        Get all client IDs in a session.
        
        Args:
            session_id: Session identifier (room name)
            
        Returns:
            List of client IDs in the session
        """
        return list(self.session_clients.get(session_id, set()))
    
    async def send_to_client(self, client_id: str, event: str, data: Any) -> bool:
        """
        Send a message to a specific client.
        
        Args:
            client_id: Client identifier
            event: Event name to emit
            data: Data to send
            
        Returns:
            True if message was sent, False otherwise
        """
        sid = self.get_sid(client_id)
        if not sid:
            logger.warning(f"Cannot send to client {client_id}: No active Socket.IO session")
            return False
            
        try:
            await self.sio.emit(event, data, room=sid)
            return True
        except Exception as e:
            logger.error(f"Error sending message to client {client_id}: {e}")
            return False
    
    async def send_to_session(self, session_id: str, event: str, data: Any) -> bool:
        """
        Send a message to all clients in a session.
        
        Args:
            session_id: Session identifier (room name)
            event: Event name to emit
            data: Data to send
            
        Returns:
            True if message was sent, False otherwise
        """
        try:
            await self.sio.emit(event, data, room=session_id)
            return True
        except Exception as e:
            logger.error(f"Error sending message to session {session_id}: {e}")
            return False
    
    def remove_client(self, sid: str) -> None:
        """
        Remove a client from all tracking.
        
        Args:
            sid: Socket.IO session ID
        """
        # Leave any rooms
        self.leave_room(sid)
        
        # Remove from mappings
        client_id = self.get_client_id(sid)
        if client_id:
            if client_id in self.client_id_to_sid:
                del self.client_id_to_sid[client_id]
                
        if sid in self.sid_to_client_id:
            del self.sid_to_client_id[sid]
            
        logger.info(f"Removed client {client_id} (sid: {sid})")


# Create a singleton instance
socketio_manager = SocketIOManager(sio)
