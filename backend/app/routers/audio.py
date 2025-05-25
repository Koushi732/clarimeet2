from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import os
import uuid
import shutil
from typing import List, Optional
import logging
import platform
import tempfile

from app.database import get_db
from app.models import models
from app.schemas import schemas
from app.utils import audio_capture

router = APIRouter(
    prefix="/audio",
    tags=["audio"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

# Helper function to ensure audio directory exists
def ensure_audio_dir():
    audio_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "audio")
    os.makedirs(audio_dir, exist_ok=True)
    return audio_dir

@router.get("/devices", response_model=List[schemas.AudioDevice])
async def get_audio_devices(db: Session = Depends(get_db)):
    """Get list of available audio devices (inputs and outputs)"""
    try:
        # Retrieve devices using platform-specific methods
        devices = audio_capture.get_audio_devices()
        
        # Store devices in the database
        db_devices = []
        for device in devices:
            db_device = models.AudioDevice(
                device_name=device["name"],
                device_id=device["id"],
                is_input=device["is_input"],
                is_default=device["is_default"],
                is_loopback=device.get("is_loopback", False)
            )
            db.add(db_device)
            db_devices.append(db_device)
        
        db.commit()
        return devices
    except Exception as e:
        logger.error(f"Error getting audio devices: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get audio devices: {str(e)}")

@router.post("/upload", response_model=schemas.Session)
async def upload_audio(
    background_tasks: BackgroundTasks,
    title: str,
    description: Optional[str] = None,
    auto_transcribe: bool = True,
    auto_summarize: bool = True,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload an audio file for processing"""
    try:
        # Validate file type
        allowed_extensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac"]
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file type. Allowed types: {', '.join(allowed_extensions)}"
            )
        
        # Create a new session record
        db_session = models.Session(
            title=title,
            description=description,
            is_live=False
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        
        # Save the file
        audio_dir = ensure_audio_dir()
        file_path = os.path.join(audio_dir, f"{db_session.id}{file_ext}")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Update session with file path
        db_session.audio_path = file_path
        db.commit()
        
        # Process in background if requested
        if auto_transcribe:
            background_tasks.add_task(
                audio_capture.process_audio_file,
                file_path=file_path,
                session_id=db_session.id,
                db=db
            )
        
        return db_session
    except Exception as e:
        logger.error(f"Error uploading audio: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload audio: {str(e)}")

@router.post("/start", response_model=schemas.Session)
async def start_recording(
    device_id: str,
    title: str,
    description: Optional[str] = None,
    loopback: bool = True,  # For system audio capture
    db: Session = Depends(get_db)
):
    """Start a live recording session"""
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
        session_id = db_session.id
        audio_dir = ensure_audio_dir()
        file_path = os.path.join(audio_dir, f"{session_id}.wav")
        
        # Start recording in a background thread
        success = audio_capture.start_recording(
            device_id=device_id,
            output_path=file_path,
            session_id=session_id,
            loopback=loopback
        )
        
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

@router.post("/stop/{session_id}", response_model=schemas.Session)
async def stop_recording(
    session_id: str,
    background_tasks: BackgroundTasks,
    auto_transcribe: bool = True,
    auto_summarize: bool = True,
    db: Session = Depends(get_db)
):
    """Stop a live recording session"""
    try:
        # Check if session exists
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Stop recording
        success, duration = audio_capture.stop_recording(session_id)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to stop recording")
        
        # Update session with duration
        db_session.duration = duration
        db.commit()
        
        # Process in background if requested
        if auto_transcribe and db_session.audio_path:
            background_tasks.add_task(
                audio_capture.process_audio_file,
                file_path=db_session.audio_path,
                session_id=session_id,
                db=db
            )
        
        return db_session
    except Exception as e:
        logger.error(f"Error stopping recording: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop recording: {str(e)}")

@router.get("/status/{session_id}", response_model=schemas.RecordingStatus)
async def get_recording_status(session_id: str, db: Session = Depends(get_db)):
    """Get the status of a recording session"""
    try:
        # Check if session exists
        db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get recording status
        is_recording, duration, level = audio_capture.get_recording_status(session_id)
        
        return {
            "session_id": session_id,
            "is_recording": is_recording,
            "duration": duration,
            "audio_level": level
        }
    except Exception as e:
        logger.error(f"Error getting recording status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get recording status: {str(e)}")
