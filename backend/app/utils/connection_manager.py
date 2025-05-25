#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
WebSocket Connection Manager for Clariimeet

Implements a robust WebSocket connection manager with reconnection handling,
error recovery, and message broadcasting capabilities.
"""

import asyncio
import logging
import json
import time
from typing import Dict, List, Any, Optional, Callable, Set, Union
from fastapi import WebSocket, WebSocketDisconnect

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections with reliable message delivery and error handling.
    
    Features:
    - Tracks active connections by client ID
    - Handles connections, disconnections, and reconnections
    - Provides message broadcasting capabilities
    - Implements error recovery mechanisms
    - Supports typed messages with validation
    """
    
    def __init__(self):
        # Active WebSocket connections by client ID
        self.active_connections: Dict[str, WebSocket] = {}
        
        # Connection state tracking
        self.connection_status: Dict[str, str] = {}  # connected, disconnected, error
        
        # Message queues for disconnected clients (to resume on reconnection)
        self.pending_messages: Dict[str, List[Dict[str, Any]]] = {}
        
        # Message handlers by type
        self.message_handlers: Dict[str, List[Callable]] = {}
        
        # Maximum pending messages per client
        self.max_pending_messages = 100
        
        logger.info("WebSocket connection manager initialized")
    
    async def connect(self, client_id: str, websocket: WebSocket) -> bool:
        """
        Accept a WebSocket connection and register it with a client ID.
        
        Args:
            client_id: Unique identifier for the client
            websocket: WebSocket connection to register
            
        Returns:
            True if connection was successful, False otherwise
        """
        try:
            # Accept the connection
            await websocket.accept()
            
            # If client was already connected, clean up the old connection
            if client_id in self.active_connections:
                try:
                    # Close the existing connection gracefully
                    old_websocket = self.active_connections[client_id]
                    await old_websocket.close(code=1001, reason="New connection established")
                except Exception as e:
                    logger.warning(f"Error closing existing connection for {client_id}: {e}")
            
            # Register the new connection
            self.active_connections[client_id] = websocket
            self.connection_status[client_id] = "connected"
            
            logger.info(f"Client connected: {client_id}")
            
            # Send any pending messages that accumulated while client was disconnected
            await self._send_pending_messages(client_id)
            
            # Send a connection confirmation message
            await asyncio.sleep(0.1)  # Small delay to ensure stability
            await self.send_message(client_id, "session_update", {"status": "connected"})
            
            return True
        except Exception as e:
            logger.error(f"Error accepting connection for client {client_id}: {e}")
            self.connection_status[client_id] = "error"
            return False
    
    async def disconnect(self, client_id: str, code: int = 1000, reason: str = "Client disconnected") -> None:
        """
        Disconnect a client and clean up resources.
        
        Args:
            client_id: ID of the client to disconnect
            code: WebSocket close code
            reason: Reason for disconnection
        """
        if client_id in self.active_connections:
            try:
                # Close the WebSocket connection gracefully
                await self.active_connections[client_id].close(code=code, reason=reason)
            except Exception as e:
                logger.warning(f"Error closing connection for {client_id}: {e}")
            
            # Clean up resources
            del self.active_connections[client_id]
            self.connection_status[client_id] = "disconnected"
            
            logger.info(f"Client disconnected: {client_id}")
    
    async def send_message(self, client_id: str, message_type: str, data: Any) -> bool:
        """
        Send a message to a specific client.
        
        Args:
            client_id: ID of the client to send the message to
            message_type: Type of message (e.g., "transcription", "summary")
            data: Message data payload
            
        Returns:
            True if message was sent successfully, False otherwise
        """
        if client_id not in self.active_connections:
            # Queue the message for when the client reconnects
            self._queue_pending_message(client_id, message_type, data)
            return False
        
        try:
            # Prepare the message
            message = {
                "type": message_type,
                "data": data,
                "timestamp": time.time()
            }
            
            # Send the message
            websocket = self.active_connections[client_id]
            await websocket.send_json(message)
            
            return True
        except Exception as e:
            logger.error(f"Error sending message to client {client_id}: {e}")
            
            # Queue the message for later delivery
            self._queue_pending_message(client_id, message_type, data)
            
            # Mark the connection as potentially broken
            self.connection_status[client_id] = "error"
            
            # Proactively remove the connection since it appears to be broken
            if client_id in self.active_connections:
                del self.active_connections[client_id]
            
            return False
    
    async def broadcast(self, message_type: str, data: Any, exclude: Optional[List[str]] = None) -> None:
        """
        Broadcast a message to all connected clients.
        
        Args:
            message_type: Type of message to broadcast
            data: Message data payload
            exclude: List of client IDs to exclude from broadcast
        """
        exclude_set = set(exclude or [])
        
        # Get all clients to broadcast to
        clients = [client_id for client_id in self.active_connections.keys() if client_id not in exclude_set]
        
        # Send to each client
        for client_id in clients:
            await self.send_message(client_id, message_type, data)
    
    async def receive_and_process(self, client_id: str) -> None:
        """
        Receive and process messages from a client.
        
        Args:
            client_id: ID of the client to receive messages from
            
        Raises:
            WebSocketDisconnect: If the client disconnects
        """
        if client_id not in self.active_connections:
            logger.warning(f"Cannot receive messages: Client {client_id} not connected")
            return
        
        websocket = self.active_connections[client_id]
        
        try:
            # Wait for a message
            message_json = await websocket.receive_text()
            
            try:
                # Parse the message
                message = json.loads(message_json)
                
                # Process the message based on its type
                if isinstance(message, dict) and "type" in message:
                    message_type = message["type"]
                    message_data = message.get("data", {})
                    
                    # Call handlers for this message type
                    await self._process_message(client_id, message_type, message_data)
                    
                    # Echo back the message as confirmation (helpful for debugging)
                    await self.send_message(client_id, message_type, message_data)
                else:
                    logger.warning(f"Received malformed message from {client_id}: {message_json}")
                    
            except json.JSONDecodeError:
                logger.warning(f"Received invalid JSON from {client_id}: {message_json}")
                
        except WebSocketDisconnect:
            # Client disconnected, clean up
            self.connection_status[client_id] = "disconnected"
            if client_id in self.active_connections:
                del self.active_connections[client_id]
            logger.info(f"Client disconnected: {client_id}")
            raise
            
        except Exception as e:
            # Other error, mark connection as potentially broken
            logger.error(f"Error receiving message from client {client_id}: {e}")
            self.connection_status[client_id] = "error"
    
    def register_handler(self, message_type: str, handler: Callable) -> None:
        """
        Register a handler for a specific message type.
        
        Args:
            message_type: Type of message to handle
            handler: Callable that processes messages of this type
        """
        if message_type not in self.message_handlers:
            self.message_handlers[message_type] = []
        
        self.message_handlers[message_type].append(handler)
        logger.debug(f"Registered handler for message type: {message_type}")
    
    def unregister_handler(self, message_type: str, handler: Callable) -> bool:
        """
        Unregister a handler for a specific message type.
        
        Args:
            message_type: Type of message the handler was registered for
            handler: The handler to unregister
            
        Returns:
            True if the handler was unregistered, False otherwise
        """
        if message_type in self.message_handlers and handler in self.message_handlers[message_type]:
            self.message_handlers[message_type].remove(handler)
            logger.debug(f"Unregistered handler for message type: {message_type}")
            return True
        return False
    
    def get_connection_status(self, client_id: str) -> str:
        """
        Get the connection status for a client.
        
        Args:
            client_id: ID of the client
            
        Returns:
            Status string ("connected", "disconnected", "error", or "unknown")
        """
        return self.connection_status.get(client_id, "unknown")
    
    def get_active_connections_count(self) -> int:
        """
        Get the number of active connections.
        
        Returns:
            Number of active connections
        """
        return len(self.active_connections)
    
    def _queue_pending_message(self, client_id: str, message_type: str, data: Any) -> None:
        """
        Queue a message for delivery when a client reconnects.
        
        Args:
            client_id: ID of the client to queue the message for
            message_type: Type of message
            data: Message data payload
        """
        if client_id not in self.pending_messages:
            self.pending_messages[client_id] = []
        
        # Prepare the message
        message = {
            "type": message_type,
            "data": data,
            "timestamp": time.time()
        }
        
        # Add to queue, respecting the maximum queue size
        pending_queue = self.pending_messages[client_id]
        pending_queue.append(message)
        
        # Trim the queue if it exceeds the maximum size
        if len(pending_queue) > self.max_pending_messages:
            # Remove oldest messages
            excess = len(pending_queue) - self.max_pending_messages
            self.pending_messages[client_id] = pending_queue[excess:]
            
            logger.warning(f"Dropped {excess} pending messages for client {client_id} due to queue limit")
    
    async def _send_pending_messages(self, client_id: str) -> None:
        """
        Send any pending messages to a client that has reconnected.
        
        Args:
            client_id: ID of the client to send pending messages to
        """
        if client_id not in self.pending_messages or not self.pending_messages[client_id]:
            return
        
        websocket = self.active_connections.get(client_id)
        if not websocket:
            return
        
        # Get pending messages and clear the queue
        pending_messages = self.pending_messages[client_id]
        self.pending_messages[client_id] = []
        
        # Send each pending message
        for message in pending_messages:
            try:
                await websocket.send_json(message)
                await asyncio.sleep(0.01)  # Small delay to prevent overwhelming the client
            except Exception as e:
                logger.error(f"Error sending pending message to client {client_id}: {e}")
                
                # Re-queue the remaining messages
                remaining_index = pending_messages.index(message)
                self.pending_messages[client_id] = pending_messages[remaining_index:]
                
                # Mark the connection as broken
                self.connection_status[client_id] = "error"
                if client_id in self.active_connections:
                    del self.active_connections[client_id]
                
                break
        
        logger.info(f"Sent {len(pending_messages) - len(self.pending_messages.get(client_id, []))} pending messages to client {client_id}")
    
    async def _process_message(self, client_id: str, message_type: str, message_data: Any) -> None:
        """
        Process a message from a client using registered handlers.
        
        Args:
            client_id: ID of the client that sent the message
            message_type: Type of message
            message_data: Message data payload
        """
        if message_type not in self.message_handlers:
            logger.debug(f"No handlers registered for message type: {message_type}")
            return
        
        # Call each registered handler
        for handler in self.message_handlers[message_type]:
            try:
                await handler(client_id, message_data)
            except Exception as e:
                logger.error(f"Error in message handler for {message_type}: {e}")

# Singleton instance of the connection manager
connection_manager = ConnectionManager()
