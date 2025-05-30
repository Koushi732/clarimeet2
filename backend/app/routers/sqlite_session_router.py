#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SQLite Session Router for Clarimeet

Implements API endpoints for session management using the SQLite database repositories.
"""

import logging
import time
import uuid
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Query, Path, status
from fastapi.responses import JSONResponse

# Import SQLite database repositories
from app.database import (
    session_repository,
    transcription_repository,
    summary_repository,
    speaker_repository,
    chat_repository
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/sessions", tags=["sessions"])

@router.get("/")
async def get_sessions(skip: int = 0, limit: int = 20):
    """
    Get a list of all sessions with pagination.
    
    Args:
        skip: Number of sessions to skip
        limit: Maximum number of sessions to return
        
    Returns:
        List of sessions
    """
    try:
        sessions = session_repository.list_sessions(limit=limit, offset=skip)
        return {"sessions": sessions, "count": len(sessions)}
    except Exception as e:
        logger.error(f"Error retrieving sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve sessions: {str(e)}")

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_session(
    name: str,
    description: str = "",
    language: str = "en",
):
    """
    Create a new session.
    
    Args:
        name: Session name
        description: Session description
        language: Session language
        
    Returns:
        Created session data
    """
    try:
        session_id = session_repository.create_session(
            name=name,
            description=description,
            language=language,
            metadata={"created_at": time.time()}
        )
        
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=500, detail="Failed to retrieve created session")
            
        return session
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")

@router.get("/{session_id}")
async def get_session(session_id: str = Path(..., description="The ID of the session to retrieve")):
    """
    Get a specific session by ID.
    
    Args:
        session_id: ID of the session to retrieve
        
    Returns:
        Session data
        
    Raises:
        HTTPException: If session not found
    """
    try:
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session: {str(e)}")

@router.put("/{session_id}")
async def update_session(
    session_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    language: Optional[str] = None,
    status: Optional[str] = None,
):
    """
    Update a session.
    
    Args:
        session_id: ID of the session to update
        name: New session name (optional)
        description: New session description (optional)
        language: New session language (optional)
        status: New session status (optional)
        
    Returns:
        Updated session data
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Prepare updates
        updates = {}
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if language is not None:
            updates["language"] = language
        if status is not None:
            updates["status"] = status
            
        # Update session
        if updates:
            success = session_repository.update_session(session_id, updates)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to update session")
                
        # Get updated session
        updated_session = session_repository.get_session(session_id)
        return updated_session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update session: {str(e)}")

@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a session and all its related data.
    
    Args:
        session_id: ID of the session to delete
        
    Returns:
        Success message
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Delete session
        success = session_repository.delete_session(session_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete session")
            
        return {"message": f"Session {session_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")

@router.get("/{session_id}/data")
async def get_session_with_data(session_id: str):
    """
    Get a session with all related data (transcriptions, summaries, speakers, chat messages).
    
    Args:
        session_id: ID of the session to retrieve
        
    Returns:
        Session data with related information
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Get session with all data
        session_data = session_repository.get_session_with_data(session_id)
        if not session_data.get("session"):
            raise HTTPException(status_code=404, detail="Session not found")
            
        return session_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving session data for {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session data: {str(e)}")

@router.get("/{session_id}/transcriptions")
async def get_session_transcriptions(
    session_id: str, 
    skip: int = 0, 
    limit: int = 100
):
    """
    Get transcriptions for a session.
    
    Args:
        session_id: ID of the session
        skip: Number of items to skip
        limit: Maximum number of items to return
        
    Returns:
        List of transcriptions
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get transcriptions
        transcriptions = transcription_repository.get_session_transcriptions(
            session_id=session_id, 
            limit=limit, 
            offset=skip
        )
        
        return {"transcriptions": transcriptions, "count": len(transcriptions)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving transcriptions for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transcriptions: {str(e)}")

@router.get("/{session_id}/transcript")
async def get_full_transcript(
    session_id: str,
    include_speakers: bool = True
):
    """
    Get the full transcript for a session.
    
    Args:
        session_id: ID of the session
        include_speakers: Whether to include speaker information
        
    Returns:
        Full transcript as text
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get full transcript
        transcript = transcription_repository.get_full_transcript(
            session_id=session_id,
            include_speakers=include_speakers
        )
        
        return {"transcript": transcript}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving transcript for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transcript: {str(e)}")

@router.get("/{session_id}/summaries")
async def get_session_summaries(session_id: str):
    """
    Get all summaries for a session.
    
    Args:
        session_id: ID of the session
        
    Returns:
        List of summaries
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get summaries
        summaries = summary_repository.get_all_summaries(session_id)
        
        return {"summaries": summaries, "count": len(summaries)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving summaries for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve summaries: {str(e)}")

@router.get("/{session_id}/summary")
async def get_latest_summary(
    session_id: str,
    summary_type: Optional[str] = None
):
    """
    Get the latest summary for a session.
    
    Args:
        session_id: ID of the session
        summary_type: Type of summary (optional)
        
    Returns:
        Latest summary
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get latest summary
        summary = summary_repository.get_latest_summary(
            session_id=session_id,
            summary_type=summary_type
        )
        
        if not summary:
            return {"message": "No summary available for this session"}
            
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving latest summary for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve summary: {str(e)}")

@router.get("/{session_id}/speakers")
async def get_session_speakers(session_id: str):
    """
    Get all speakers for a session.
    
    Args:
        session_id: ID of the session
        
    Returns:
        List of speakers
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get speakers
        speakers = speaker_repository.get_session_speakers(session_id)
        
        return {"speakers": speakers, "count": len(speakers)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving speakers for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve speakers: {str(e)}")

@router.put("/{session_id}/speakers/{speaker_id}")
async def update_speaker(
    session_id: str,
    speaker_id: str,
    name: str
):
    """
    Update a speaker's name.
    
    Args:
        session_id: ID of the session
        speaker_id: ID of the speaker
        name: New speaker name
        
    Returns:
        Updated speaker data
        
    Raises:
        HTTPException: If session or speaker not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Check if speaker exists
        speaker = speaker_repository.get_speaker(speaker_id, session_id)
        if not speaker:
            raise HTTPException(status_code=404, detail="Speaker not found")
            
        # Update speaker name
        success = speaker_repository.update_speaker_name(
            speaker_id=speaker_id,
            session_id=session_id,
            name=name
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update speaker name")
            
        # Get updated speaker
        updated_speaker = speaker_repository.get_speaker(speaker_id, session_id)
        return updated_speaker
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating speaker {speaker_id} for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update speaker: {str(e)}")

@router.get("/{session_id}/chat")
async def get_session_chat_messages(
    session_id: str,
    skip: int = 0,
    limit: int = 50
):
    """
    Get chat messages for a session.
    
    Args:
        session_id: ID of the session
        skip: Number of messages to skip
        limit: Maximum number of messages to return
        
    Returns:
        List of chat messages
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get chat messages
        messages = chat_repository.get_session_messages(
            session_id=session_id,
            limit=limit,
            offset=skip
        )
        
        return {"messages": messages, "count": len(messages)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving chat messages for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve chat messages: {str(e)}")
