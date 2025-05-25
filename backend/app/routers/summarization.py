from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.database import get_db
from app.models import models
from app.schemas import schemas
from app.utils import summarization_service

router = APIRouter(
    prefix="/summarization",
    tags=["summarization"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

@router.get("/{session_id}", response_model=List[schemas.Summary])
async def get_summaries(
    session_id: str, 
    summary_type: Optional[str] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """Get summaries for a specific session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get summaries
        query = db.query(models.Summary).filter(models.Summary.session_id == session_id)
        if summary_type:
            query = query.filter(models.Summary.summary_type == summary_type)
        
        summaries = query.order_by(models.Summary.created_at).offset(skip).limit(limit).all()
        
        return summaries
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting summaries for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get summaries: {str(e)}")

@router.post("/{session_id}/generate", response_model=schemas.SummarizationStatus)
async def generate_summary(
    session_id: str,
    background_tasks: BackgroundTasks,
    summary_type: str = "overall",
    model: str = "bart-large-cnn",
    segment_start: Optional[float] = None,
    segment_end: Optional[float] = None,
    db: Session = Depends(get_db)
):
    """Generate a summary for a session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if there are transcriptions
        transcription_count = db.query(models.Transcription).filter(
            models.Transcription.session_id == session_id
        ).count()
        
        if transcription_count == 0:
            raise HTTPException(status_code=400, detail="No transcriptions available for summarization")
        
        # Generate summary in background
        background_tasks.add_task(
            summarization_service.generate_summary,
            session_id=session_id,
            summary_type=summary_type,
            model=model,
            segment_start=segment_start,
            segment_end=segment_end,
            db=db
        )
        
        return {
            "session_id": session_id,
            "status": "generating",
            "summary_type": summary_type,
            "model": model
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating summary for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {str(e)}")

@router.post("/{session_id}/start-realtime", response_model=schemas.SummarizationStatus)
async def start_realtime_summarization(
    session_id: str,
    summary_type: str = "incremental",
    model: str = "bart-large-cnn",
    interval_seconds: int = 60,  # Generate summary every minute
    db: Session = Depends(get_db)
):
    """Start real-time summarization for a session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Start real-time summarization
        success = summarization_service.start_realtime_summarization(
            session_id=session_id,
            summary_type=summary_type,
            model=model,
            interval_seconds=interval_seconds
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to start real-time summarization")
        
        return {
            "session_id": session_id,
            "status": "started",
            "summary_type": summary_type,
            "model": model,
            "interval_seconds": interval_seconds
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting real-time summarization for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start real-time summarization: {str(e)}")

@router.post("/{session_id}/stop-realtime", response_model=schemas.SummarizationStatus)
async def stop_realtime_summarization(session_id: str, db: Session = Depends(get_db)):
    """Stop real-time summarization for a session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Stop real-time summarization
        success = summarization_service.stop_realtime_summarization(session_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to stop real-time summarization")
        
        return {
            "session_id": session_id,
            "status": "stopped"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping real-time summarization for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop real-time summarization: {str(e)}")

@router.get("/{session_id}/status", response_model=schemas.SummarizationStatus)
async def get_summarization_status(session_id: str, db: Session = Depends(get_db)):
    """Get summarization status for a session"""
    try:
        # Check if session exists
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get summarization status
        status = summarization_service.get_summarization_status(session_id)
        
        return status
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting summarization status for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get summarization status: {str(e)}")
