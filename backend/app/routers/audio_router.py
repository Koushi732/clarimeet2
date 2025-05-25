#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Audio Router for Clariimeet

Implements API endpoints for audio file uploads, processing, and management.
Supports various audio formats and provides status tracking for processing.
"""

import os
import uuid
import logging
import shutil
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi import Form, status, Response, Query
from fastapi.responses import FileResponse
import json
import tempfile
from sqlalchemy.orm import Session
from pydub import AudioSegment

from ..database import get_db
from ..models.models import Session as SessionModel
from ..schemas.session import SessionCreate, SessionResponse
from ..config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/audio", tags=["audio"])

# Constants
SUPPORTED_AUDIO_FORMATS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"]
MAX_AUDIO_SIZE_MB = 100  # Maximum audio file size in MB
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Utility functions
def get_audio_duration(file_path: str) -> float:
    """
    Get the duration of an audio file in seconds.
    
    Args:
        file_path: Path to the audio file
        
    Returns:
        Duration in seconds
    """
    try:
        audio = AudioSegment.from_file(file_path)
        return len(audio) / 1000  # Convert milliseconds to seconds
    except Exception as e:
        logger.error(f"Error getting audio duration: {e}")
        return 0.0

def validate_audio_file(file: UploadFile) -> bool:
    """
    Validate an uploaded audio file.
    
    Args:
        file: Uploaded file
        
    Returns:
        True if valid, False otherwise
    """
    # Check file extension
    file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else ""
    if file_extension not in SUPPORTED_AUDIO_FORMATS:
        return False
    
    # File size check will be done in the endpoint
    return True

@router.post("/upload", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio_file(
    file: UploadFile = File(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """
    Upload an audio file and create a new session.
    
    Args:
        file: Audio file to upload
        title: Title for the session
        description: Optional description for the session
        background_tasks: FastAPI background tasks
        db: Database session
        
    Returns:
        Created session
        
    Raises:
        HTTPException: If file is invalid or too large
    """
    # Validate file
    if not validate_audio_file(file):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid audio file format. Supported formats: {', '.join(SUPPORTED_AUDIO_FORMATS)}"
        )
    
    # Check file size
    file_size_mb = 0
    file.file.seek(0, os.SEEK_END)
    file_size_mb = file.file.tell() / (1024 * 1024)  # Convert bytes to MB
    file.file.seek(0)  # Reset file pointer to beginning
    
    if file_size_mb > MAX_AUDIO_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file too large. Maximum size: {MAX_AUDIO_SIZE_MB} MB"
        )
    
    try:
        # Generate a unique session ID
        session_id = str(uuid.uuid4())
        
        # Create session directory
        session_dir = os.path.join(UPLOAD_DIR, session_id)
        os.makedirs(session_dir, exist_ok=True)
        
        # Save the file
        file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else "mp3"
        save_path = os.path.join(session_dir, f"audio.{file_extension}")
        
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get audio duration
        duration = get_audio_duration(save_path)
        
        # Create session in database
        db_session = SessionModel(
            id=session_id,
            title=title,
            description=description,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            audio_path=save_path,
            duration=duration,
            is_live=False  # This is an uploaded file, not live recording
        )
        
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        
        # Start transcription in background if enabled
        if background_tasks and settings.AUTO_TRANSCRIBE_UPLOADS:
            from ..utils.real_time_transcription import transcribe_audio_file
            
            background_tasks.add_task(
                transcribe_audio_file,
                file_path=save_path,
                session_id=session_id,
                db=db
            )
        
        logger.info(f"Audio file uploaded: {file.filename}, Session ID: {session_id}")
        return db_session
    
    except Exception as e:
        logger.error(f"Error uploading audio file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading audio file: {str(e)}"
        )

@router.get("/formats")
async def get_supported_formats():
    """
    Get supported audio formats.
    
    Returns:
        List of supported audio formats
    """
    return {
        "supported_formats": SUPPORTED_AUDIO_FORMATS,
        "max_size_mb": MAX_AUDIO_SIZE_MB
    }

@router.get("/session/{session_id}/download")
async def download_audio(session_id: str, db: Session = Depends(get_db)):
    """
    Download the audio file for a session.
    
    Args:
        session_id: ID of the session
        db: Database session
        
    Returns:
        Audio file as stream
        
    Raises:
        HTTPException: If session not found or has no audio file
    """
    # Check if session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if session has an audio file
    if not session.audio_path or not os.path.exists(session.audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Get file info
    file_path = session.audio_path
    file_name = os.path.basename(file_path)
    file_extension = file_path.split('.')[-1].lower() if '.' in file_path else "mp3"
    
    # Set appropriate content type
    content_types = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "aac": "audio/aac",
        "ogg": "audio/ogg",
        "flac": "audio/flac"
    }
    content_type = content_types.get(file_extension, "application/octet-stream")
    
    # Return the file
    return FileResponse(
        path=file_path,
        filename=f"{session.title}.{file_extension}",
        media_type=content_type
    )

@router.post("/convert")
async def convert_audio(
    file: UploadFile = File(...),
    output_format: str = Form(...),
    background_tasks: BackgroundTasks = None
):
    """
    Convert an audio file to a different format.
    
    Args:
        file: Audio file to convert
        output_format: Target format
        background_tasks: FastAPI background tasks
        
    Returns:
        Conversion status and download info
        
    Raises:
        HTTPException: If file is invalid or format is unsupported
    """
    # Validate input file
    if not validate_audio_file(file):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid audio file format. Supported formats: {', '.join(SUPPORTED_AUDIO_FORMATS)}"
        )
    
    # Validate output format
    if output_format.lower() not in SUPPORTED_AUDIO_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid output format. Supported formats: {', '.join(SUPPORTED_AUDIO_FORMATS)}"
        )
    
    try:
        # Create conversion directory
        conversion_id = str(uuid.uuid4())
        conversion_dir = os.path.join(UPLOAD_DIR, "conversions", conversion_id)
        os.makedirs(conversion_dir, exist_ok=True)
        
        # Save the input file
        input_file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else "mp3"
        input_path = os.path.join(conversion_dir, f"input.{input_file_extension}")
        
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Define output path
        output_path = os.path.join(conversion_dir, f"output.{output_format.lower()}")
        
        # Convert in background
        if background_tasks:
            background_tasks.add_task(
                convert_audio_background,
                input_path=input_path,
                output_path=output_path,
                conversion_id=conversion_id
            )
        else:
            # Convert synchronously if no background tasks available
            await convert_audio_background(input_path, output_path, conversion_id)
        
        # Return conversion details
        return {
            "status": "processing",
            "conversion_id": conversion_id,
            "original_filename": file.filename,
            "output_format": output_format.lower(),
            "check_status_url": f"/audio/conversion/{conversion_id}/status"
        }
    
    except Exception as e:
        logger.error(f"Error converting audio: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error converting audio: {str(e)}"
        )

async def convert_audio_background(input_path: str, output_path: str, conversion_id: str):
    """
    Convert audio file in the background.
    
    Args:
        input_path: Path to input file
        output_path: Path to output file
        conversion_id: ID for the conversion job
    """
    try:
        # Load audio with pydub
        audio = AudioSegment.from_file(input_path)
        
        # Export to the desired format
        audio.export(output_path, format=os.path.splitext(output_path)[1][1:])
        
        # Update conversion status
        status_path = os.path.join(os.path.dirname(output_path), "status.json")
        with open(status_path, "w") as f:
            json.dump({"status": "completed", "timestamp": datetime.utcnow().isoformat()}, f)
        
        logger.info(f"Audio conversion completed: {conversion_id}")
    
    except Exception as e:
        logger.error(f"Error in audio conversion: {e}")
        
        # Update status with error
        status_path = os.path.join(os.path.dirname(output_path), "status.json")
        with open(status_path, "w") as f:
            json.dump({"status": "error", "error": str(e), "timestamp": datetime.utcnow().isoformat()}, f)

@router.get("/conversion/{conversion_id}/status")
async def get_conversion_status(conversion_id: str):
    """
    Get the status of an audio conversion job.
    
    Args:
        conversion_id: ID of the conversion job
        
    Returns:
        Conversion status
        
    Raises:
        HTTPException: If conversion job not found
    """
    # Check if conversion directory exists
    conversion_dir = os.path.join(UPLOAD_DIR, "conversions", conversion_id)
    if not os.path.exists(conversion_dir):
        raise HTTPException(status_code=404, detail="Conversion job not found")
    
    # Check status file
    status_path = os.path.join(conversion_dir, "status.json")
    if os.path.exists(status_path):
        with open(status_path, "r") as f:
            status_data = json.load(f)
        
        # If completed, add download URL
        if status_data.get("status") == "completed":
            status_data["download_url"] = f"/audio/conversion/{conversion_id}/download"
        
        return status_data
    
    # If no status file, it's still processing
    return {"status": "processing", "conversion_id": conversion_id}

@router.get("/conversion/{conversion_id}/download")
async def download_converted_audio(conversion_id: str):
    """
    Download a converted audio file.
    
    Args:
        conversion_id: ID of the conversion job
        
    Returns:
        Converted audio file
        
    Raises:
        HTTPException: If conversion job not found or not completed
    """
    # Check if conversion directory exists
    conversion_dir = os.path.join(UPLOAD_DIR, "conversions", conversion_id)
    if not os.path.exists(conversion_dir):
        raise HTTPException(status_code=404, detail="Conversion job not found")
    
    # Check status file
    status_path = os.path.join(conversion_dir, "status.json")
    if not os.path.exists(status_path):
        raise HTTPException(status_code=400, detail="Conversion still in progress")
    
    with open(status_path, "r") as f:
        status_data = json.load(f)
    
    if status_data.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Conversion not completed. Status: {status_data.get('status')}"
        )
    
    # Find output file
    output_files = [f for f in os.listdir(conversion_dir) if f.startswith("output.")]
    if not output_files:
        raise HTTPException(status_code=404, detail="Converted file not found")
    
    output_file = output_files[0]
    output_path = os.path.join(conversion_dir, output_file)
    file_extension = output_file.split('.')[-1]
    
    # Set appropriate content type
    content_types = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "aac": "audio/aac",
        "ogg": "audio/ogg",
        "flac": "audio/flac"
    }
    content_type = content_types.get(file_extension, "application/octet-stream")
    
    # Return the file
    return FileResponse(
        path=output_path,
        filename=f"converted.{file_extension}",
        media_type=content_type
    )
