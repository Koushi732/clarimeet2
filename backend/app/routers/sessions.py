from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import logging

from app.database import get_db
from app.models import models
from app.schemas import schemas

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

@router.get("/", response_model=List[schemas.Session])
async def get_all_sessions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """Get all meeting sessions"""
    try:
        sessions = db.query(models.Session).order_by(
            models.Session.created_at.desc()
        ).offset(skip).limit(limit).all()
        return sessions
    except Exception as e:
        logger.error(f"Error getting sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")

@router.get("/{session_id}", response_model=schemas.SessionDetail)
async def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get a specific session by ID with transcriptions and summaries"""
    try:
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get transcriptions
        transcriptions = db.query(models.Transcription).filter(
            models.Transcription.session_id == session_id
        ).order_by(models.Transcription.timestamp).all()
        
        # Get summaries
        summaries = db.query(models.Summary).filter(
            models.Summary.session_id == session_id
        ).order_by(models.Summary.created_at).all()
        
        return {
            **session.__dict__,
            "transcriptions": transcriptions,
            "summaries": summaries
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get session: {str(e)}")

@router.put("/{session_id}", response_model=schemas.Session)
async def update_session(
    session_id: str, 
    session_update: schemas.SessionUpdate, 
    db: Session = Depends(get_db)
):
    """Update session details"""
    try:
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Update fields
        if session_update.title is not None:
            db_session.title = session_update.title
        if session_update.description is not None:
            db_session.description = session_update.description
        
        db.commit()
        db.refresh(db_session)
        return db_session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update session: {str(e)}")

@router.delete("/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a session and its associated data"""
    try:
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Delete audio file if it exists
        if db_session.audio_path and os.path.exists(db_session.audio_path):
            try:
                os.remove(db_session.audio_path)
            except Exception as e:
                logger.warning(f"Failed to delete audio file {db_session.audio_path}: {e}")
        
        # Delete session (will cascade delete transcriptions and summaries)
        db.delete(db_session)
        db.commit()
        
        return {"message": "Session deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")

@router.get("/{session_id}/export", response_model=schemas.SessionExport)
async def export_session(session_id: str, format: str = "json", db: Session = Depends(get_db)):
    """Export session data in specified format (json, markdown)"""
    try:
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get transcriptions
        transcriptions = db.query(models.Transcription).filter(
            models.Transcription.session_id == session_id
        ).order_by(models.Transcription.timestamp).all()
        
        # Get summaries
        summaries = db.query(models.Summary).filter(
            models.Summary.session_id == session_id
        ).order_by(models.Summary.created_at).all()
        
        # Create export data
        export_data = {
            "session": {
                "id": db_session.id,
                "title": db_session.title,
                "description": db_session.description,
                "created_at": db_session.created_at.isoformat(),
                "duration": db_session.duration,
            },
            "transcriptions": [
                {
                    "timestamp": t.timestamp,
                    "end_timestamp": t.end_timestamp,
                    "text": t.text,
                    "speaker": t.speaker
                } for t in transcriptions
            ],
            "summaries": [
                {
                    "summary_type": s.summary_type,
                    "text": s.text,
                    "segment_start": s.segment_start,
                    "segment_end": s.segment_end
                } for s in summaries
            ]
        }
        
        return export_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export session: {str(e)}")
