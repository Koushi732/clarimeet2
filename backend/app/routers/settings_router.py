#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Settings Router for Clarimeet

Implements API endpoints for user and session settings management using the SQLite database repositories.
"""

import json
import logging
from typing import Dict, List, Optional, Any, Union
from fastapi import APIRouter, HTTPException, Path, Query

# Import SQLite database repositories
from app.database import settings_repository

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("/user/{user_id}")
async def get_user_settings(
    user_id: str = Path(..., description="User ID to retrieve settings for")
):
    """
    Get all settings for a user.
    
    Args:
        user_id: User ID
        
    Returns:
        Dictionary of user settings
    """
    try:
        settings = settings_repository.get_all_user_settings(user_id)
        
        # Parse JSON values where applicable
        parsed_settings = {}
        for key, setting in settings.items():
            if isinstance(setting, dict) and "value" in setting:
                try:
                    parsed_settings[key] = json.loads(setting["value"])
                except (json.JSONDecodeError, TypeError):
                    parsed_settings[key] = setting["value"]
            else:
                parsed_settings[key] = setting
                
        return parsed_settings
    except Exception as e:
        logger.error(f"Error retrieving settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve settings: {str(e)}")

@router.get("/user/{user_id}/{key}")
async def get_user_setting(
    user_id: str = Path(..., description="User ID"),
    key: str = Path(..., description="Setting key")
):
    """
    Get a specific setting for a user.
    
    Args:
        user_id: User ID
        key: Setting key
        
    Returns:
        Setting value or null if not found
    """
    try:
        setting = settings_repository.get_setting(user_id, key)
        if not setting:
            return {"value": None}
            
        # Parse JSON value if applicable
        try:
            value = json.loads(setting["value"])
        except (json.JSONDecodeError, TypeError):
            value = setting["value"]
            
        return {"value": value}
    except Exception as e:
        logger.error(f"Error retrieving setting {key} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve setting: {str(e)}")

@router.put("/user/{user_id}")
async def update_user_settings(
    user_id: str,
    settings: Dict[str, Any]
):
    """
    Update or create multiple settings for a user.
    
    Args:
        user_id: User ID
        settings: Dictionary of settings to update
        
    Returns:
        Updated settings
    """
    try:
        # Update each setting in the dictionary
        for key, value in settings.items():
            # Convert value to JSON string if not already a string
            if not isinstance(value, str):
                value_str = json.dumps(value)
            else:
                value_str = value
                
            # Save setting
            settings_repository.save_setting(user_id, key, value_str)
        
        # Return all user settings
        return await get_user_settings(user_id)
    except Exception as e:
        logger.error(f"Error updating settings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update user settings: {str(e)}")

@router.put("/user/{user_id}/{key}")
async def update_user_setting(
    user_id: str,
    key: str,
    value: Union[str, int, float, bool, dict, list]
):
    """
    Update or create a setting for a user.
    
    Args:
        user_id: User ID
        key: Setting key
        value: Setting value (can be any JSON-serializable value)
        
    Returns:
        Updated setting
    """
    try:
        # Convert value to JSON string if not already a string
        if not isinstance(value, str):
            value_str = json.dumps(value)
        else:
            value_str = value
            
        # Save setting
        settings_repository.save_setting(user_id, key, value_str)
        
        # Return the saved setting
        setting = settings_repository.get_setting(user_id, key)
        if not setting:
            raise HTTPException(status_code=500, detail="Failed to retrieve updated setting")
            
        # Parse JSON value if applicable
        try:
            parsed_value = json.loads(setting["value"])
        except (json.JSONDecodeError, TypeError):
            parsed_value = setting["value"]
            
        return {"key": key, "value": parsed_value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating setting {key} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update setting: {str(e)}")

@router.delete("/user/{user_id}/{key}")
async def delete_user_setting(
    user_id: str,
    key: str
):
    """
    Delete a setting for a user.
    
    Args:
        user_id: User ID
        key: Setting key
        
    Returns:
        Success status
    """
    try:
        success = settings_repository.delete_setting(user_id, key)
        if not success:
            raise HTTPException(status_code=404, detail=f"Setting {key} not found for user {user_id}")
            
        return {"message": f"Setting {key} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting setting {key} for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete setting: {str(e)}")

@router.get("/default-transcription")
async def get_default_transcription_settings():
    """
    Get default transcription settings.
    
    Returns:
        Default transcription settings
    """
    return {
        "language": "en",
        "speakerDiarization": True,
        "model": "deepgram",
        "fillerWords": False,
        "punctuation": True,
        "endpointing": 300,  # 300ms of silence to consider speech finished
        "sampleRate": 16000,
        "audioChannels": 1
    }

@router.get("/default-summarization")
async def get_default_summarization_settings():
    """
    Get default summarization settings.
    
    Returns:
        Default summarization settings
    """
    return {
        "enabled": True,
        "model": "gemini",
        "minTranscriptLength": 300,  # Minimum characters needed for summarization
        "autoSummarizeInterval": 2 * 60,  # Auto-summarize every 2 minutes
        "summaryTypes": [
            "key_points",
            "action_items",
            "decisions_made"
        ]
    }


@router.get("/session/{session_id}")
async def get_session_settings(
    session_id: str = Path(..., description="Session ID to retrieve settings for")
):
    """
    Get all settings for a session.
    
    Args:
        session_id: Session ID
        
    Returns:
        Dictionary of session settings
    """
    try:
        # Use a prefix for session settings to avoid collisions with user settings
        settings_prefix = f"session_{session_id}_"
        all_settings = settings_repository.get_all_settings_with_prefix(settings_prefix)
        
        # Parse JSON values where applicable and remove prefix
        parsed_settings = {}
        for key, setting in all_settings.items():
            # Remove the prefix from the key
            clean_key = key.replace(settings_prefix, "")
            
            if isinstance(setting, dict) and "value" in setting:
                try:
                    parsed_settings[clean_key] = json.loads(setting["value"])
                except (json.JSONDecodeError, TypeError):
                    parsed_settings[clean_key] = setting["value"]
            else:
                parsed_settings[clean_key] = setting
                
        return parsed_settings
    except Exception as e:
        logger.error(f"Error retrieving settings for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session settings: {str(e)}")


@router.put("/session/{session_id}")
async def update_session_settings(
    session_id: str,
    settings: Dict[str, Any]
):
    """
    Update or create multiple settings for a session.
    
    Args:
        session_id: Session ID
        settings: Dictionary of settings to update
        
    Returns:
        Updated settings
    """
    try:
        # Save each setting individually with session prefix
        settings_prefix = f"session_{session_id}_"
        for key, value in settings.items():
            # Convert value to JSON string if not already a string
            if not isinstance(value, str):
                value_str = json.dumps(value)
            else:
                value_str = value
                
            # Save setting with session ID prefix
            settings_repository.save_setting(settings_prefix + key, "value", value_str)
        
        # Return all session settings
        return await get_session_settings(session_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating settings for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update session settings: {str(e)}")


@router.get("/session/{session_id}/{key}")
async def get_session_setting(
    session_id: str = Path(..., description="Session ID"),
    key: str = Path(..., description="Setting key")
):
    """
    Get a specific setting for a session.
    
    Args:
        session_id: Session ID
        key: Setting key
        
    Returns:
        Setting value or null if not found
    """
    try:
        # Use a prefix for session settings
        settings_prefix = f"session_{session_id}_"
        setting = settings_repository.get_setting(settings_prefix + key, "value")
        
        if not setting:
            return {"value": None}
            
        # Parse JSON value if applicable
        try:
            value = json.loads(setting["value"])
        except (json.JSONDecodeError, TypeError):
            value = setting["value"]
            
        return {"value": value}
    except Exception as e:
        logger.error(f"Error retrieving setting {key} for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session setting: {str(e)}")


@router.put("/session/{session_id}/{key}")
async def update_session_setting(
    session_id: str,
    key: str,
    value: Union[str, int, float, bool, dict, list]
):
    """
    Update or create a setting for a session.
    
    Args:
        session_id: Session ID
        key: Setting key
        value: Setting value (can be any JSON-serializable value)
        
    Returns:
        Updated setting
    """
    try:
        # Convert value to JSON string if not already a string
        if not isinstance(value, str):
            value_str = json.dumps(value)
        else:
            value_str = value
        
        # Use a prefix for session settings
        settings_prefix = f"session_{session_id}_"
        # Save setting with session ID prefix
        settings_repository.save_setting(settings_prefix + key, "value", value_str)
        
        # Return the saved setting
        setting = settings_repository.get_setting(settings_prefix + key, "value")
        if not setting:
            raise HTTPException(status_code=500, detail="Failed to retrieve updated setting")
            
        # Parse JSON value if applicable
        try:
            parsed_value = json.loads(setting["value"])
        except (json.JSONDecodeError, TypeError):
            parsed_value = setting["value"]
            
        return {"key": key, "value": parsed_value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating setting {key} for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update session setting: {str(e)}")


@router.delete("/session/{session_id}/{key}")
async def delete_session_setting(
    session_id: str,
    key: str
):
    """
    Delete a setting for a session.
    
    Args:
        session_id: Session ID
        key: Setting key
        
    Returns:
        Success status
    """
    try:
        # Use a prefix for session settings
        settings_prefix = f"session_{session_id}_"
        success = settings_repository.delete_setting(settings_prefix + key, "value")
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Setting {key} not found for session {session_id}")
            
        return {"message": f"Setting {key} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting setting {key} for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete session setting: {str(e)}")
