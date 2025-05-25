import os
import logging
import uuid
import shutil
from typing import Dict, List, Tuple, Optional, Any

# Setup logging
logger = logging.getLogger(__name__)

# Simplified audio devices - no hardware detection
def get_audio_devices() -> List[Dict[str, Any]]:
    """Get a list of available audio devices (simplified mock version)."""
    return [
        {
            "id": "default",
            "name": "Default Microphone",
            "is_input": True,
            "is_default": True,
            "is_loopback": False
        },
        {
            "id": "system",
            "name": "System Audio",
            "is_input": False,
            "is_default": False,
            "is_loopback": True
        }
    ]

def start_recording(device_id: str, output_path: str, session_id: str, loopback: bool = False) -> bool:
    """Start recording audio from a device (simplified mock version)."""
    logger.info(f"[Mock] Starting recording with device {device_id} for session {session_id}")
    return True

def stop_recording(session_id: str) -> Tuple[bool, float]:
    """Stop recording audio for a session (simplified mock version)."""
    logger.info(f"[Mock] Stopping recording for session {session_id}")
    return True, 60.0  # Mock 60 seconds duration

def get_recording_status(session_id: str) -> Tuple[bool, float, float]:
    """Get recording status for a session (simplified mock version)."""
    return True, 30.0, 0.5  # is_recording, duration, audio_level

def process_audio_file(file_path: str, session_id: str, db=None) -> bool:
    """Process an audio file for transcription (simplified mock version)."""
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            logger.error(f"Audio file not found: {file_path}")
            return False
            
        # Instead of actual processing, just log the file
        logger.info(f"[Mock] Processing audio file {file_path} for session {session_id}")
        
        # Create mock transcription data
        if db:
            try:
                from app.models.models import Transcription, Summary
                
                # Add mock transcription
                transcription = Transcription(
                    session_id=session_id,
                    timestamp=0.0,
                    end_timestamp=60.0,
                    text="This is a mock transcription generated because audio processing libraries are not available.",
                    confidence=0.9,
                    speaker="Speaker 1"
                )
                db.add(transcription)
                
                # Add mock summary
                summary = Summary(
                    session_id=session_id,
                    summary_type="overall",
                    text="This is a mock summary generated because audio processing libraries are not available."
                )
                db.add(summary)
                
                db.commit()
                logger.info(f"Added mock transcription and summary for session {session_id}")
            except Exception as db_error:
                logger.error(f"Error adding mock data to database: {db_error}")
        
        return True
    except Exception as e:
        logger.error(f"Error in mock audio processing: {e}")
        return False
