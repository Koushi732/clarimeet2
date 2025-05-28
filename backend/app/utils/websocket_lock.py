"""
WebSocket Lock Utility

This module provides a locking mechanism for WebSocket connections to prevent
concurrent receive operations that lead to the error:
"cannot call recv while another coroutine is already waiting for the next message"
"""

import asyncio
from typing import Dict, Optional


class WebSocketConnectionManager:
    """Manages WebSocket connections with proper locking to prevent concurrent receive operations"""
    
    def __init__(self):
        self.connection_locks: Dict[str, asyncio.Lock] = {}
        
    def get_lock(self, client_id: str) -> asyncio.Lock:
        """Get or create a lock for a specific client connection"""
        if client_id not in self.connection_locks:
            self.connection_locks[client_id] = asyncio.Lock()
        return self.connection_locks[client_id]
    
    def remove_lock(self, client_id: str) -> None:
        """Remove a client's lock when connection is closed"""
        if client_id in self.connection_locks:
            del self.connection_locks[client_id]
    
    async def receive_safe(self, websocket, client_id: str) -> Optional[str]:
        """Safely receive a message with proper locking to prevent concurrent receives"""
        lock = self.get_lock(client_id)
        
        # Use the lock to ensure only one coroutine can receive at a time
        async with lock:
            try:
                # Try to receive with a short timeout to avoid blocking forever on closed connections
                try:
                    # Set a timeout for receiving to avoid hanging on closed connections
                    return await asyncio.wait_for(websocket.receive_text(), timeout=0.5)
                except asyncio.TimeoutError:
                    # Connection might be stale but not officially closed
                    print(f"Timeout receiving message from client {client_id}")
                    return None
            except Exception as e:
                # Log but don't raise to allow for clean shutdown
                print(f"Error receiving message from client {client_id}: {str(e)}")
                return None


# Global instance to be used across the application
connection_manager = WebSocketConnectionManager()
