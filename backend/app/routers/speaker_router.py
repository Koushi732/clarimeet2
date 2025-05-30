#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Speaker Router for Clarimeet

Implements API endpoints for speaker management using the SQLite database repositories.
"""

import logging
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Path

# Import SQLite database repositories
from app.database import speaker_repository, session_repository

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/speakers", tags=["speakers"])

@router.get("/")
async def get_all_speakers():
    """
    Get all speakers across all sessions.
    
    Returns:
        List of speakers
    """
    try:
        speakers = speaker_repository.list_all_speakers()
        return {"speakers": speakers, "count": len(speakers)}
    except Exception as e:
        logger.error(f"Error retrieving speakers: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve speakers: {str(e)}")

@router.get("/{speaker_id}")
async def get_speaker(
    speaker_id: str = Path(..., description="The ID of the speaker to retrieve"),
    session_id: Optional[str] = None
):
    """
    Get a specific speaker by ID.
    
    Args:
        speaker_id: ID of the speaker to retrieve
        session_id: Optional session ID to scope the search
        
    Returns:
        Speaker data
        
    Raises:
        HTTPException: If speaker not found
    """
    try:
        speaker = speaker_repository.get_speaker(speaker_id, session_id)
        if not speaker:
            raise HTTPException(status_code=404, detail="Speaker not found")
            
        return speaker
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving speaker {speaker_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve speaker: {str(e)}")

@router.put("/{speaker_id}")
async def update_speaker(
    speaker_id: str,
    name: str,
    session_id: str
):
    """
    Update a speaker's name.
    
    Args:
        speaker_id: ID of the speaker to update
        name: New speaker name
        session_id: Session ID for the speaker
        
    Returns:
        Updated speaker data
        
    Raises:
        HTTPException: If speaker not found
    """
    try:
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
        logger.error(f"Error updating speaker {speaker_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update speaker: {str(e)}")

@router.get("/session/{session_id}")
async def get_session_speakers(
    session_id: str = Path(..., description="The ID of the session")
):
    """
    Get all speakers for a specific session.
    
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
            
        # Get speakers for the session
        speakers = speaker_repository.get_session_speakers(session_id)
        
        return {"speakers": speakers, "count": len(speakers)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving speakers for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve speakers: {str(e)}")

@router.get("/session/{session_id}/stats")
async def get_session_speaker_stats(
    session_id: str = Path(..., description="The ID of the session")
):
    """
    Get speaking statistics for all speakers in a session.
    
    Args:
        session_id: ID of the session
        
    Returns:
        Dictionary of speaker statistics
        
    Raises:
        HTTPException: If session not found
    """
    try:
        # Check if session exists
        session = session_repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get speaker statistics
        statistics = speaker_repository.get_session_speaker_statistics(session_id)
        
        return statistics
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving speaker statistics for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve speaker statistics: {str(e)}")
