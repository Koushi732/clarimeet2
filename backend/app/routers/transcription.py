from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.database import get_db
from app.models import models
from app.schemas import schemas
from app.utils import transcription_service

router = APIRouter(
    prefix="/transcription",
    tags=["transcription"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

@router.get("/{session_id}", response_model=List[schemas.Transcription])
async def get_transcriptions(
    session_id: str, 
    skip: int = 0, 
    limit: int = 1000, 
    db: Session = Depends(get_db)
):
    """Get transcriptions for a specific session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get transcriptions
        transcriptions = db.query(models.Transcription).filter(
            models.Transcription.session_id == session_id
        ).order_by(models.Transcription.timestamp).offset(skip).limit(limit).all()
        
        return transcriptions
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting transcriptions for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get transcriptions: {str(e)}")

@router.post("/{session_id}/start", response_model=schemas.TranscriptionStatus)
async def start_transcription(
    session_id: str,
    model: str = "whisper-small",
    language: str = "en",
    db: Session = Depends(get_db)
):
    """Start real-time transcription for a session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Start transcription process
        success = transcription_service.start_transcription(
            session_id=session_id,
            audio_path=session.audio_path,
            model=model,
            language=language
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to start transcription")
        
        return {
            "session_id": session_id,
            "status": "started",
            "model": model,
            "language": language
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting transcription for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start transcription: {str(e)}")

@router.post("/{session_id}/stop", response_model=schemas.TranscriptionStatus)
async def stop_transcription(session_id: str, db: Session = Depends(get_db)):
    """Stop real-time transcription for a session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Stop transcription process
        success = transcription_service.stop_transcription(session_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to stop transcription")
        
        return {
            "session_id": session_id,
            "status": "stopped"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping transcription for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop transcription: {str(e)}")

@router.get("/{session_id}/status", response_model=schemas.TranscriptionStatus)
async def get_transcription_status(session_id: str, db: Session = Depends(get_db)):
    """Get transcription status for a session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get transcription status
        status = transcription_service.get_transcription_status(session_id)
        
        return status
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting transcription status for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get transcription status: {str(e)}")

@router.post("/{session_id}/process", response_model=schemas.TranscriptionStatus)
async def process_audio(
    session_id: str,
    background_tasks: BackgroundTasks,
    model: str = "whisper-small",
    language: str = "en",
    db: Session = Depends(get_db)
):
    """Process audio file for a session (non-real-time)"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if not session.audio_path:
            raise HTTPException(status_code=400, detail="Session has no associated audio file")
        
        # Process audio in background
        background_tasks.add_task(
            transcription_service.process_audio_file,
            session_id=session_id,
            audio_path=session.audio_path,
            model=model,
            language=language,
            db=db
        )
        
        return {
            "session_id": session_id,
            "status": "processing",
            "model": model,
            "language": language
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing audio for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process audio: {str(e)}")
