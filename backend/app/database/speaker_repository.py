#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Speaker Repository for Clarimeet

Handles database operations for speaker data.
"""

import logging
import uuid
from typing import Dict, List, Optional, Any

from .database import get_db_connection

# Configure logging
logger = logging.getLogger(__name__)

class SpeakerRepository:
    """Repository for speaker data"""
    
    @staticmethod
    def save_speaker(session_id: str, speaker_id: str, name: str, word_count: int = 0, talk_time: float = 0) -> bool:
        """
        Save a speaker for a session
        
        Args:
            session_id: Session ID
            speaker_id: Speaker ID
            name: Speaker name
            word_count: Number of words spoken
            talk_time: Talk time in seconds
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # Check if speaker already exists
                cursor.execute(
                    "SELECT id FROM speakers WHERE id = ? AND session_id = ?",
                    (speaker_id, session_id)
                )
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing speaker
                    cursor.execute(
                        """
                        UPDATE speakers 
                        SET name = ?, word_count = ?, talk_time = ?
                        WHERE id = ? AND session_id = ?
                        """,
                        (name, word_count, talk_time, speaker_id, session_id)
                    )
                else:
                    # Insert new speaker
                    cursor.execute(
                        """
                        INSERT INTO speakers 
                        (id, session_id, name, word_count, talk_time) 
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (speaker_id, session_id, name, word_count, talk_time)
                    )
                
                conn.commit()
                
                logger.debug(f"Saved speaker {speaker_id} for session {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error saving speaker: {e}")
            return False
    
    @staticmethod
    def update_speaker_stats(speaker_id: str, session_id: str, word_count_delta: int = 0, talk_time_delta: float = 0) -> bool:
        """
        Update speaker statistics
        
        Args:
            speaker_id: Speaker ID
            session_id: Session ID
            word_count_delta: Words to add to count
            talk_time_delta: Time to add to talk time
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                
                # First, check if the speaker exists
                cursor.execute(
                    "SELECT word_count, talk_time FROM speakers WHERE id = ? AND session_id = ?",
                    (speaker_id, session_id)
                )
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing speaker
                    new_word_count = existing["word_count"] + word_count_delta
                    new_talk_time = existing["talk_time"] + talk_time_delta
                    
                    cursor.execute(
                        """
                        UPDATE speakers 
                        SET word_count = ?, talk_time = ?
                        WHERE id = ? AND session_id = ?
                        """,
                        (new_word_count, new_talk_time, speaker_id, session_id)
                    )
                    conn.commit()
                    return True
                else:
                    # Speaker doesn't exist
                    logger.warning(f"Speaker {speaker_id} not found for session {session_id}")
                    return False
                
        except Exception as e:
            logger.error(f"Error updating speaker stats: {e}")
            return False
    
    @staticmethod
    def get_session_speakers(session_id: str) -> List[Dict[str, Any]]:
        """
        Get all speakers for a session
        
        Args:
            session_id: Session ID
            
        Returns:
            List[Dict[str, Any]]: List of speakers
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT * FROM speakers 
                    WHERE session_id = ? 
                    ORDER BY word_count DESC
                    """,
                    (session_id,)
                )
                return cursor.fetchall()
                
        except Exception as e:
            logger.error(f"Error getting speakers for session {session_id}: {e}")
            return []
    
    @staticmethod
    def get_speaker(speaker_id: str, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a speaker by ID
        
        Args:
            speaker_id: Speaker ID
            session_id: Session ID
            
        Returns:
            Optional[Dict[str, Any]]: Speaker data or None if not found
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM speakers WHERE id = ? AND session_id = ?",
                    (speaker_id, session_id)
                )
                return cursor.fetchone()
                
        except Exception as e:
            logger.error(f"Error getting speaker {speaker_id}: {e}")
            return None
    
    @staticmethod
    def update_speaker_name(speaker_id: str, session_id: str, name: str) -> bool:
        """
        Update a speaker's name
        
        Args:
            speaker_id: Speaker ID
            session_id: Session ID
            name: New name
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE speakers 
                    SET name = ?
                    WHERE id = ? AND session_id = ?
                    """,
                    (name, speaker_id, session_id)
                )
                conn.commit()
                
                success = cursor.rowcount > 0
                if success:
                    logger.info(f"Updated speaker {speaker_id} name to '{name}'")
                else:
                    logger.warning(f"Speaker {speaker_id} not found for update")
                
                return success
                
        except Exception as e:
            logger.error(f"Error updating speaker name: {e}")
            return False

# Create a singleton instance
speaker_repository = SpeakerRepository()
