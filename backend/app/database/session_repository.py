#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Session Repository for Clarimeet

Handles database operations for sessions.
"""

import json
import logging
import time
import uuid
from typing import Dict, List, Optional, Any

from .database import get_db_connection

# Configure logging
logger = logging.getLogger(__name__)

class SessionRepository:
    """Repository for session data"""
    
    @staticmethod
    def create_session(name: str, description: str = "", language: str = "en", metadata: Dict = None) -> str:
        """
        Create a new session
        
        Args:
            name: Session name
            description: Session description
            language: Session language
            metadata: Additional metadata
            
        Returns:
            str: Session ID
        """
        session_id = str(uuid.uuid4())
        current_time = int(time.time())
        
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO sessions 
                    (id, name, description, created_at, updated_at, status, language, metadata) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session_id,
                        name,
                        description,
                        current_time,
                        current_time,
                        "created",
                        language,
                        json.dumps(metadata or {})
                    )
                )
                conn.commit()
                
            logger.info(f"Created session {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            raise
    
    @staticmethod
    def get_session(session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a session by ID
        
        Args:
            session_id: Session ID
            
        Returns:
            Optional[Dict[str, Any]]: Session data or None if not found
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
                session = cursor.fetchone()
                
                if session and "metadata" in session and session["metadata"]:
                    # Parse JSON metadata
                    session["metadata"] = json.loads(session["metadata"])
                
                return session
                
        except Exception as e:
            logger.error(f"Error getting session {session_id}: {e}")
            return None
    
    @staticmethod
    def update_session(session_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update a session
        
        Args:
            session_id: Session ID
            updates: Fields to update
            
        Returns:
            bool: Success status
        """
        if not updates:
            return True
            
        current_time = int(time.time())
        updates["updated_at"] = current_time
        
        # Convert metadata to JSON if present
        if "metadata" in updates and isinstance(updates["metadata"], dict):
            updates["metadata"] = json.dumps(updates["metadata"])
        
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Build SET clause for SQL query
                set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
                values = list(updates.values())
                values.append(session_id)
                
                cursor.execute(
                    f"UPDATE sessions SET {set_clause} WHERE id = ?",
                    values
                )
                conn.commit()
                
                success = cursor.rowcount > 0
                if success:
                    logger.info(f"Updated session {session_id}")
                else:
                    logger.warning(f"Session {session_id} not found for update")
                
                return success
                
        except Exception as e:
            logger.error(f"Error updating session {session_id}: {e}")
            return False
    
    @staticmethod
    def delete_session(session_id: str) -> bool:
        """
        Delete a session and all related data
        
        Args:
            session_id: Session ID
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Delete related data first
                for table in ["transcriptions", "summaries", "speakers", "chat_messages"]:
                    cursor.execute(f"DELETE FROM {table} WHERE session_id = ?", (session_id,))
                
                # Delete the session
                cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
                conn.commit()
                
                success = cursor.rowcount > 0
                if success:
                    logger.info(f"Deleted session {session_id} and all related data")
                else:
                    logger.warning(f"Session {session_id} not found for deletion")
                
                return success
                
        except Exception as e:
            logger.error(f"Error deleting session {session_id}: {e}")
            return False
    
    @staticmethod
    def list_sessions(limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        """
        List sessions with pagination
        
        Args:
            limit: Maximum number of sessions to return
            offset: Pagination offset
            
        Returns:
            List[Dict[str, Any]]: List of sessions
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (limit, offset)
                )
                sessions = cursor.fetchall()
                
                # Parse JSON metadata for each session
                for session in sessions:
                    if session.get("metadata"):
                        session["metadata"] = json.loads(session["metadata"])
                
                return sessions
                
        except Exception as e:
            logger.error(f"Error listing sessions: {e}")
            return []
    
    @staticmethod
    def get_session_with_data(session_id: str) -> Dict[str, Any]:
        """
        Get a session with all related data
        
        Args:
            session_id: Session ID
            
        Returns:
            Dict[str, Any]: Session data with transcriptions, summaries, speakers, and chat messages
        """
        result = {
            "session": None,
            "transcriptions": [],
            "summaries": [],
            "speakers": [],
            "chat_messages": []
        }
        
        try:
            session = SessionRepository.get_session(session_id)
            if not session:
                return result
                
            result["session"] = session
            
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Get transcriptions
                cursor.execute(
                    "SELECT * FROM transcriptions WHERE session_id = ? ORDER BY timestamp",
                    (session_id,)
                )
                result["transcriptions"] = cursor.fetchall()
                
                # Get summaries
                cursor.execute(
                    "SELECT * FROM summaries WHERE session_id = ? ORDER BY created_at",
                    (session_id,)
                )
                result["summaries"] = cursor.fetchall()
                
                # Get speakers
                cursor.execute(
                    "SELECT * FROM speakers WHERE session_id = ?",
                    (session_id,)
                )
                result["speakers"] = cursor.fetchall()
                
                # Get chat messages
                cursor.execute(
                    "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp",
                    (session_id,)
                )
                result["chat_messages"] = cursor.fetchall()
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting session data for {session_id}: {e}")
            return result

# Create a singleton instance
session_repository = SessionRepository()
