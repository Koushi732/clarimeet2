#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Transcription Repository for Clarimeet

Handles database operations for transcriptions.
"""

import logging
import time
import uuid
from typing import Dict, List, Optional, Any

from .database import get_db_connection

# Configure logging
logger = logging.getLogger(__name__)

class TranscriptionRepository:
    """Repository for transcription data"""
    
    @staticmethod
    def save_transcription(
        session_id: str,
        text: str,
        is_final: bool = True,
        speaker_id: str = None,
        speaker_name: str = None,
        confidence: float = None,
        start_time: float = None,
        end_time: float = None
    ) -> str:
        """
        Save a transcription segment
        
        Args:
            session_id: Session ID
            text: Transcribed text
            is_final: Whether this is a final transcription
            speaker_id: Speaker ID if available
            speaker_name: Speaker name if available
            confidence: Confidence score (0-1)
            start_time: Start time in seconds
            end_time: End time in seconds
            
        Returns:
            str: Transcription ID
        """
        transcription_id = str(uuid.uuid4())
        timestamp = int(time.time())
        
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO transcriptions 
                    (id, session_id, text, is_final, timestamp, speaker_id, speaker_name, confidence, start_time, end_time) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        transcription_id,
                        session_id,
                        text,
                        1 if is_final else 0,
                        timestamp,
                        speaker_id,
                        speaker_name,
                        confidence,
                        start_time,
                        end_time
                    )
                )
                conn.commit()
                
            logger.debug(f"Saved transcription {transcription_id} for session {session_id}")
            return transcription_id
            
        except Exception as e:
            logger.error(f"Error saving transcription: {e}")
            raise
    
    @staticmethod
    def get_session_transcriptions(session_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Get transcriptions for a session
        
        Args:
            session_id: Session ID
            limit: Maximum number of transcriptions to return
            offset: Pagination offset
            
        Returns:
            List[Dict[str, Any]]: List of transcriptions
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT * FROM transcriptions 
                    WHERE session_id = ? 
                    ORDER BY timestamp
                    LIMIT ? OFFSET ?
                    """,
                    (session_id, limit, offset)
                )
                return cursor.fetchall()
                
        except Exception as e:
            logger.error(f"Error getting transcriptions for session {session_id}: {e}")
            return []
    
    @staticmethod
    def get_full_transcript(session_id: str, include_speakers: bool = True) -> str:
        """
        Get the full transcript for a session
        
        Args:
            session_id: Session ID
            include_speakers: Whether to include speaker information
            
        Returns:
            str: Full transcript
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT text, speaker_name, is_final 
                    FROM transcriptions 
                    WHERE session_id = ? AND is_final = 1
                    ORDER BY timestamp
                    """,
                    (session_id,)
                )
                transcriptions = cursor.fetchall()
                
                if include_speakers:
                    # Format with speaker names if available
                    lines = []
                    for t in transcriptions:
                        if t["speaker_name"]:
                            lines.append(f"[{t['speaker_name']}] {t['text']}")
                        else:
                            lines.append(t["text"])
                    return "\n".join(lines)
                else:
                    # Just join the text
                    return " ".join([t["text"] for t in transcriptions])
                
        except Exception as e:
            logger.error(f"Error getting full transcript for session {session_id}: {e}")
            return ""
    
    @staticmethod
    def delete_session_transcriptions(session_id: str) -> bool:
        """
        Delete all transcriptions for a session
        
        Args:
            session_id: Session ID
            
        Returns:
            bool: Success status
        """
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM transcriptions WHERE session_id = ?", (session_id,))
                conn.commit()
                
                deleted_count = cursor.rowcount
                logger.info(f"Deleted {deleted_count} transcriptions for session {session_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error deleting transcriptions for session {session_id}: {e}")
            return False

# Create a singleton instance
transcription_repository = TranscriptionRepository()
