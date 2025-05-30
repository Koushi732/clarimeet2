#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Session Router for Clariimeet

Implements API endpoints for session management, including CRUD operations,
transcription and summarization control, and export functionality.
"""

import os
import time
import uuid
import logging
import json
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Path
from fastapi import File, UploadFile, Form, status, Response
from fastapi.responses import FileResponse
import tempfile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import Session as SessionModel
from ..models.models import Transcription, Summary
from ..schemas.session import SessionCreate, SessionUpdate, SessionResponse, SessionList
from ..schemas.transcription import TranscriptionCreate, TranscriptionResponse
from ..schemas.summary import SummaryCreate, SummaryResponse
from ..utils.export_service import export_session, get_supported_export_formats
from ..utils.real_time_transcription import get_transcription_status
from ..utils.summarization_service import get_summarization_status, generate_summary

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.get("/")
async def get_sessions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Get a list of all sessions with optional pagination.
    
    Args:
        skip: Number of sessions to skip
        limit: Maximum number of sessions to return
        db: Database session
        
    Returns:
        List of sessions
    """
    try:
        # Add debug logging
        logger.info(f"Fetching sessions with skip={skip}, limit={limit}")
        
        # Use simple query first
        sessions = []
        try:
            # Create a simple empty session if no sessions exist
            if db.query(SessionModel).count() == 0:
                logger.info("No sessions found, creating a demo session")
                demo_session = SessionModel(
                    id=str(uuid.uuid4()),
                    title="Demo Session",
                    description="This is a demo session created automatically",
                    duration=0,
                    is_live=False
                )
                db.add(demo_session)
                db.commit()
                
            # Then query for sessions again
            query_result = db.query(SessionModel).order_by(SessionModel.created_at.desc()).offset(skip).limit(limit).all()
            sessions = query_result
            logger.info(f"Found {len(sessions)} sessions")
        except Exception as e:
            logger.error(f"Database query error: {e}")
            # Return empty list rather than failing
            sessions = []
        
        # Convert SQLAlchemy models to dictionaries manually
        result = []
        for session in sessions:
            try:
                session_dict = {
                    "id": str(session.id),
                    "title": str(session.title) if session.title else "Untitled Session",
                    "description": str(session.description) if session.description else None,
                    "duration": float(session.duration) if session.duration else 0.0,
                    "is_live": bool(session.is_live),
                    "audio_path": str(session.audio_path) if session.audio_path else None
                }
                
                # Handle date objects carefully
                if session.created_at:
                    try:
                        session_dict["created_at"] = session.created_at.isoformat()
                    except Exception:
                        session_dict["created_at"] = str(session.created_at)
                else:
                    session_dict["created_at"] = None
                    
                if session.updated_at:
                    try:
                        session_dict["updated_at"] = session.updated_at.isoformat()
                    except Exception:
                        session_dict["updated_at"] = str(session.updated_at)
                else:
                    session_dict["updated_at"] = None
                    
                result.append(session_dict)
            except Exception as e:
                logger.error(f"Error converting session to dict: {e}")
                # Continue with other sessions instead of failing completely
                continue
        
        # Create a direct JSON response with explicit CORS headers
        from fastapi.responses import JSONResponse
        response = JSONResponse(content=result)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        
        return response
    except Exception as e:
        logger.error(f"Error in get_sessions: {e}")
        # Return empty array instead of error
        response = JSONResponse(content=[])
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

@router.post("/", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(session: SessionCreate, db: Session = Depends(get_db)):
    """
    Create a new session.
    
    Args:
        session: Session data
        db: Database session
        
    Returns:
        Created session
    """
    session_id = str(uuid.uuid4())
    db_session = SessionModel(
        id=session_id,
        title=session.title,
        description=session.description,
        duration=session.duration,
        audio_path=session.audio_path,
        is_live=session.is_live
    )
    
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    
    logger.info(f"Created new session: {session_id}")
    return db_session

@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str = Path(..., description="The ID of the session to retrieve"),
                      db: Session = Depends(get_db)):
    """
    Get a specific session by ID.
    
    Args:
        session_id: ID of the session to retrieve
        db: Database session
        
    Returns:
        Session data
        
    Raises:
        HTTPException: If session not found
    """
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session

@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(session_id: str, session_update: SessionUpdate, db: Session = Depends(get_db)):
    """
    Update a session.
    
    Args:
        session_id: ID of the session to update
        session_update: Updated session data
        db: Database session
        
    Returns:
        Updated session
        
    Raises:
        HTTPException: If session not found
    """
    db_session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Update fields
    update_data = session_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_session, key, value)
    
    # Update the updated_at timestamp
    db_session.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_session)
    
    logger.info(f"Updated session: {session_id}")
    return db_session

@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """
    Delete a session.
    
    Args:
        session_id: ID of the session to delete
        db: Database session
        
    Raises:
        HTTPException: If session not found
    """
    db_session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Delete the session (cascade will delete related transcriptions and summaries)
    db.delete(db_session)
    db.commit()
    
    logger.info(f"Deleted session: {session_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/{session_id}/transcriptions", response_model=List[TranscriptionResponse])
async def get_session_transcriptions(session_id: str, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Get all transcriptions for a session.
    
    Args:
        session_id: ID of the session
        skip: Number of transcriptions to skip
        limit: Maximum number of transcriptions to return
        db: Database session
        
    Returns:
        List of transcriptions
        
    Raises:
        HTTPException: If session not found
    """
    # Check if session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get transcriptions
    transcriptions = db.query(Transcription).filter(
        Transcription.session_id == session_id
    ).order_by(Transcription.timestamp.asc()).offset(skip).limit(limit).all()
    
    return transcriptions

@router.get("/{session_id}/summaries", response_model=List[SummaryResponse])
async def get_session_summaries(session_id: str, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Get all summaries for a session.
    
    Args:
        session_id: ID of the session
        skip: Number of summaries to skip
        limit: Maximum number of summaries to return
        db: Database session
        
    Returns:
        List of summaries
        
    Raises:
        HTTPException: If session not found
    """
    # Check if session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get summaries
    summaries = db.query(Summary).filter(
        Summary.session_id == session_id
    ).order_by(Summary.created_at.asc()).offset(skip).limit(limit).all()
    
    return summaries

@router.post("/{session_id}/transcribe", status_code=status.HTTP_202_ACCEPTED)
async def transcribe_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    model: str = "whisper-small",
    language: str = "en",
    db: Session = Depends(get_db)
):
    """
    Start transcription for a session in the background.
    
    Args:
        session_id: ID of the session to transcribe
        background_tasks: FastAPI background tasks
        model: Transcription model to use
        language: Language of the audio
        db: Database session
        
    Returns:
        Status message
        
    Raises:
        HTTPException: If session not found or has no audio file
    """
    # Check if session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if session has an audio file
    if not session.audio_path or not os.path.exists(session.audio_path):
        raise HTTPException(status_code=400, detail="Session has no audio file")
    
    # Import here to avoid circular imports
    from ..utils.real_time_transcription import transcribe_audio_file
    
    # Start transcription in the background
    background_tasks.add_task(
        transcribe_audio_file,
        file_path=session.audio_path,
        model_size=model,
        language=language,
        device=None,  # Auto-detect
    )
    
    return {"status": "Transcription started", "session_id": session_id}

@router.get("/{session_id}/transcription-status")
async def get_transcription_status_endpoint(session_id: str, db: Session = Depends(get_db)):
    """
    Get the transcription status for a session.
    
    Args:
        session_id: ID of the session
        db: Database session
        
    Returns:
        Transcription status
        
    Raises:
        HTTPException: If session not found
    """
    # Check if session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get transcription status
    status = get_transcription_status(session_id, db)
    
    return status

@router.post("/{session_id}/summarize", status_code=status.HTTP_202_ACCEPTED)
async def summarize_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    summary_type: str = "overall",
    model: str = "bart-large-cnn",
    segment_start: Optional[float] = None,
    segment_end: Optional[float] = None,
    db: Session = Depends(get_db)
):
    """
    Start summarization for a session in the background.
    
    Args:
        session_id: ID of the session to summarize
        background_tasks: FastAPI background tasks
        summary_type: Type of summary to generate
        model: Summarization model to use
        segment_start: Start time for segment summarization
        segment_end: End time for segment summarization
        db: Database session
        
    Returns:
        Status message
        
    Raises:
        HTTPException: If session not found or has no transcriptions
    """
    # Check if session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if session has transcriptions
    transcription_count = db.query(Transcription).filter(Transcription.session_id == session_id).count()
    if transcription_count == 0:
        raise HTTPException(status_code=400, detail="Session has no transcriptions to summarize")
    
    # Start summarization in the background
    background_tasks.add_task(
        generate_summary,
        session_id=session_id,
        summary_type=summary_type,
        model=model,
        segment_start=segment_start,
        segment_end=segment_end,
        db=db
    )
    
    return {"status": "Summarization started", "session_id": session_id}

@router.get("/{session_id}/summarization-status")
async def get_summarization_status_endpoint(session_id: str):
    """
    Get the summarization status for a session.
    
    Args:
        session_id: ID of the session
        
    Returns:
        Summarization status
    """
    # Get summarization status
    status = get_summarization_status(session_id)
    
    return status

@router.get("/{session_id}/export-formats")
async def get_export_formats():
    """
    Get supported export formats.
    
    Returns:
        List of supported export formats
    """
    return get_supported_export_formats()

@router.get("/{session_id}/export")
async def export_session_endpoint(
    session_id: str,
    format_type: str = Query(..., description="Export format (markdown or pdf)"),
    include_transcription: bool = Query(True, description="Include transcription in export"),
    include_summary: bool = Query(True, description="Include summary in export"),
    db: Session = Depends(get_db)
):
    """
    Export a session to a specific format.
    
    Args:
        session_id: ID of the session to export
        format_type: Export format (markdown or pdf)
        include_transcription: Whether to include transcription
        include_summary: Whether to include summary
        db: Database session
        
    Returns:
        For Markdown: Content as text response
        For PDF: Temporary file path
        
    Raises:
        HTTPException: If session not found or export fails
    """
    # Check if session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Export the session
    if format_type.lower() == "markdown":
        content = export_session(
            session_id=session_id,
            format_type="markdown",
            include_transcription=include_transcription,
            include_summary=include_summary,
            db=db
        )
        
        if not content or content.startswith("# Error"):
            raise HTTPException(status_code=500, detail="Failed to export session to Markdown")
        
        # Return the Markdown content as text
        return Response(content=content, media_type="text/markdown")
    
    elif format_type.lower() == "pdf":
        # Create a temporary directory for the PDF export
        output_dir = os.path.join(tempfile.gettempdir(), "clariimeet_exports")
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate output path
        output_path = os.path.join(output_dir, f"session_{session_id}_{int(time.time())}.pdf")
        
        # Export to PDF
        success = export_session(
            session_id=session_id,
            format_type="pdf",
            output_path=output_path,
            include_transcription=include_transcription,
            include_summary=include_summary,
            db=db
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to export session to PDF")
        
        # Return the PDF file path
        return {"file_path": output_path}
    
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported export format: {format_type}")

@router.get("/{session_id}/download")
async def download_export(
    session_id: str,
    file_path: str = Query(..., description="Path to the exported file"),
    format_type: str = Query(..., description="Export format (markdown or pdf)")
):
    """
    Download an exported file.
    
    Args:
        session_id: ID of the session
        file_path: Path to the exported file
        format_type: Export format (markdown or pdf)
        
    Returns:
        File download response
        
    Raises:
        HTTPException: If file not found
    """
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Export file not found")
    
    # Set content type based on format
    content_type = "text/markdown" if format_type.lower() == "markdown" else "application/pdf"
    
    # Set filename
    filename = f"session_{session_id}.{format_type.lower()}"
    
    # Return the file as a download response
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=content_type
    )
