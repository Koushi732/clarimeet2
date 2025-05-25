from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import os
import uuid
import shutil
from typing import List, Optional
import logging

from app.database import get_db
from app.models import models
from app.schemas import schemas
from app.utils import simplified_audio, simplified_transcription

router = APIRouter(
    prefix="/api",
    tags=["api"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

# Helper function to ensure audio directory exists
def ensure_audio_dir():
    audio_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "audio")
    os.makedirs(audio_dir, exist_ok=True)
    return audio_dir

@router.get("/audio/devices", response_model=List[schemas.AudioDevice])
async def get_audio_devices(db: Session = Depends(get_db)):
    """Get list of available audio devices (inputs and outputs)"""
    try:
        # Retrieve devices using simplified implementation
        devices = simplified_audio.get_audio_devices()
        return devices
    except Exception as e:
        logger.error(f"Error getting audio devices: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get audio devices: {str(e)}")

@router.post("/sessions", response_model=schemas.Session)
async def create_session(title: str, description: Optional[str] = None, db: Session = Depends(get_db)):
    """Create a new session"""
    try:
        db_session = models.Session(
            title=title,
            description=description,
            is_live=False,
            duration=0
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        return db_session
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")

@router.get("/sessions", response_model=List[schemas.Session])
async def get_all_sessions(db: Session = Depends(get_db)):
    """Get all sessions"""
    try:
        sessions = db.query(models.Session).all()
        return sessions
    except Exception as e:
        logger.error(f"Error getting sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")

@router.get("/sessions/{session_id}", response_model=schemas.SessionDetail)
async def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get session details"""
    try:
        session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        # Get transcriptions and summaries
        transcriptions = db.query(models.Transcription).filter(models.Transcription.session_id == session_id).all()
        summaries = db.query(models.Summary).filter(models.Summary.session_id == session_id).all()
        
        # Create response with joined data
        result = schemas.SessionDetail(
            **session.__dict__,
            transcriptions=transcriptions,
            summaries=summaries
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get session: {str(e)}")

@router.post("/audio/upload", response_model=schemas.Session)
async def upload_audio(title: str, description: Optional[str] = None, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload an audio file and process it"""
    try:
        # Create a new session
        db_session = models.Session(
            title=title,
            description=description,
            is_live=False
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        
        # Save the uploaded file
        audio_dir = ensure_audio_dir()
        file_ext = os.path.splitext(file.filename)[1].lower() if file.filename else ".wav"
        file_path = os.path.join(audio_dir, f"{db_session.id}{file_ext}")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Update session with file path
        db_session.audio_path = file_path
        db.commit()
        
        # Process audio file in background
        simplified_audio.process_audio_file(file_path, db_session.id, db)
        
        return db_session
    except Exception as e:
        logger.error(f"Error uploading audio: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload audio: {str(e)}")

@router.post("/audio/start", response_model=schemas.Session)
async def start_recording(device_id: str, title: str, description: Optional[str] = None, db: Session = Depends(get_db)):
    """Start a recording session"""
    try:
        # Create a new session
        db_session = models.Session(
            title=title,
            description=description,
            is_live=True
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        
        # Initialize recording
        audio_dir = ensure_audio_dir()
        file_path = os.path.join(audio_dir, f"{db_session.id}.wav")
        
        # Start mock recording
        success = simplified_audio.start_recording(device_id, file_path, db_session.id)
        
        if not success:
            db.delete(db_session)
            db.commit()
            raise HTTPException(status_code=500, detail="Failed to start recording")
        
        # Update session with file path
        db_session.audio_path = file_path
        db.commit()
        
        return db_session
    except Exception as e:
        logger.error(f"Error starting recording: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start recording: {str(e)}")

@router.post("/audio/stop/{session_id}", response_model=schemas.Session)
async def stop_recording(session_id: str, db: Session = Depends(get_db)):
    """Stop a recording session"""
    try:
        # Check if session exists
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Stop recording
        success, duration = simplified_audio.stop_recording(session_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to stop recording")
        
        # Update session with duration
        db_session.duration = duration
        db.commit()
        
        # Process audio file
        if db_session.audio_path:
            simplified_transcription.process_audio_file(session_id, db_session.audio_path, db=db)
        
        return db_session
    except Exception as e:
        logger.error(f"Error stopping recording: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop recording: {str(e)}")

@router.get("/audio/status/{session_id}", response_model=schemas.RecordingStatus)
async def get_recording_status(session_id: str, db: Session = Depends(get_db)):
    """Get recording status"""
    try:
        # Check if session exists
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get recording status
        is_recording, duration, level = simplified_audio.get_recording_status(session_id)
        
        return {
            "session_id": session_id,
            "is_recording": is_recording,
            "duration": duration,
            "audio_level": level
        }
    except Exception as e:
        logger.error(f"Error getting recording status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get recording status: {str(e)}")

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a session"""
    try:
        # Check if session exists
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Delete audio file if it exists
        if db_session.audio_path and os.path.exists(db_session.audio_path):
            try:
                os.remove(db_session.audio_path)
            except Exception as e:
                logger.warning(f"Failed to delete audio file: {e}")
        
        # Delete session (will cascade delete transcriptions and summaries)
        db.delete(db_session)
        db.commit()
        
        return {"message": "Session deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")
