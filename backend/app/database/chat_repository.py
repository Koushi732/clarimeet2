#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Chat Repository for Clarimeet

Handles database operations for chat messages.
"""

import logging
import time
import uuid
from typing import Dict, List, Optional, Any

from .database import get_db_connection

# Configure logging
logger = logging.getLogger(__name__)

class ChatRepository:
    """Repository for chat message data"""
    
    @staticmethod
    def save_message(session_id: str, sender: str, receiver: str, content: str) -> str:
        """
        Save a chat message
        
        Args:
            session_id: Session ID
            sender: Sender identifier (user ID or 'assistant')
            receiver: Receiver identifier (user ID, 'all', or 'assistant')
            content: Message content
            
        Returns:
            str: Message ID
        """
        message_id = str(uuid.uuid4())
        timestamp = int(time.time())
        
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO chat_messages 
                    (id, session_id, sender, receiver, content, timestamp) 
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        message_id,
                        session_id,
                        sender,
                        receiver,
                        content,
                        timestamp
                    )
                )
                conn.commit()
                
            logger.debug(f"Saved chat message {message_id} for session {session_id}")
            return message_id
            
        except Exception as e:
            logger.error(f"Error saving chat message: {e}")
            raise
    
    @staticmethod
    def get_session_messages(session_id: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Get chat messages for a session
        
        Args:
            session_id: Session ID
            limit: Maximum number of messages to return
            offset: Pagination offset
            
        Returns:
            List[Dict[str, Any]]: List of chat messages
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT * FROM chat_messages 
                    WHERE session_id = ? 
                    ORDER BY timestamp
                    LIMIT ? OFFSET ?
                    """,
                    (session_id, limit, offset)
                )
                return cursor.fetchall()
                
        except Exception as e:
            logger.error(f"Error getting chat messages for session {session_id}: {e}")
            return []
    
    @staticmethod
    def get_conversation_history(session_id: str) -> List[Dict[str, Any]]:
        """
        Get conversation history for a session
        
        Args:
            session_id: Session ID
            
        Returns:
            List[Dict[str, Any]]: List of messages formatted for AI context
        """
        try:
            messages = ChatRepository.get_session_messages(session_id, limit=100)
            
            # Format for AI context (e.g. for chat models)
            conversation = []
            for msg in messages:
                role = "assistant" if msg["sender"] == "assistant" else "user"
                conversation.append({
                    "role": role,
                    "content": msg["content"]
                })
            
            return conversation
            
        except Exception as e:
            logger.error(f"Error getting conversation history for session {session_id}: {e}")
            return []
    
    @staticmethod
    def delete_session_messages(session_id: str) -> bool:
        """
        Delete all chat messages for a session
        
        Args:
            session_id: Session ID
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
                conn.commit()
                
                deleted_count = cursor.rowcount
                logger.info(f"Deleted {deleted_count} chat messages for session {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error deleting chat messages for session {session_id}: {e}")
            return False

# Create a singleton instance
chat_repository = ChatRepository()
