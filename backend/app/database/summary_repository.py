#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Summary Repository for Clarimeet

Handles database operations for meeting summaries.
"""

import logging
import time
import uuid
from typing import Dict, List, Optional, Any

from .database import get_db_connection

# Configure logging
logger = logging.getLogger(__name__)

class SummaryRepository:
    """Repository for summary data"""
    
    @staticmethod
    def save_summary(session_id: str, content: str, summary_type: str = "general") -> str:
        """
        Save a summary for a session
        
        Args:
            session_id: Session ID
            content: Summary content
            summary_type: Type of summary (general, bullet_points, etc.)
            
        Returns:
            str: Summary ID
        """
        summary_id = str(uuid.uuid4())
        created_at = int(time.time())
        
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO summaries 
                    (id, session_id, content, type, created_at) 
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        summary_id,
                        session_id,
                        content,
                        summary_type,
                        created_at
                    )
                )
                conn.commit()
                
            logger.info(f"Saved {summary_type} summary {summary_id} for session {session_id}")
            return summary_id
            
        except Exception as e:
            logger.error(f"Error saving summary: {e}")
            raise
    
    @staticmethod
    def get_latest_summary(session_id: str, summary_type: str = None) -> Optional[Dict[str, Any]]:
        """
        Get the latest summary for a session
        
        Args:
            session_id: Session ID
            summary_type: Type of summary to filter by (optional)
            
        Returns:
            Optional[Dict[str, Any]]: Latest summary or None if not found
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                if summary_type:
                    cursor.execute(
                        """
                        SELECT * FROM summaries 
                        WHERE session_id = ? AND type = ?
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        (session_id, summary_type)
                    )
                else:
                    cursor.execute(
                        """
                        SELECT * FROM summaries 
                        WHERE session_id = ?
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        (session_id,)
                    )
                
                return cursor.fetchone()
                
        except Exception as e:
            logger.error(f"Error getting latest summary for session {session_id}: {e}")
            return None
    
    @staticmethod
    def get_all_summaries(session_id: str) -> List[Dict[str, Any]]:
        """
        Get all summaries for a session
        
        Args:
            session_id: Session ID
            
        Returns:
            List[Dict[str, Any]]: List of summaries
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT * FROM summaries 
                    WHERE session_id = ? 
                    ORDER BY created_at DESC
                    """,
                    (session_id,)
                )
                return cursor.fetchall()
                
        except Exception as e:
            logger.error(f"Error getting summaries for session {session_id}: {e}")
            return []
    
    @staticmethod
    def delete_session_summaries(session_id: str) -> bool:
        """
        Delete all summaries for a session
        
        Args:
            session_id: Session ID
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM summaries WHERE session_id = ?", (session_id,))
                conn.commit()
                
                deleted_count = cursor.rowcount
                logger.info(f"Deleted {deleted_count} summaries for session {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error deleting summaries for session {session_id}: {e}")
            return False

# Create a singleton instance
summary_repository = SummaryRepository()
