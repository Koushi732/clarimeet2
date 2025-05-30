#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Language Router for Clarimeet

Implements API endpoints for language selection and management.
"""

import logging
import json
import os
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Query

# Import settings repository to store user language preferences
from app.database import settings_repository

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/languages", tags=["languages"])

# Define language support levels
LANGUAGE_SUPPORT = {
    "en": {"name": "English", "level": "full"},
    "es": {"name": "Spanish", "level": "full"},
    "fr": {"name": "French", "level": "full"},
    "de": {"name": "German", "level": "full"},
    "it": {"name": "Italian", "level": "full"},
    "pt": {"name": "Portuguese", "level": "full"},
    "nl": {"name": "Dutch", "level": "full"},
    "ja": {"name": "Japanese", "level": "beta"},
    "zh": {"name": "Chinese", "level": "beta"},
    "ko": {"name": "Korean", "level": "beta"},
    "ru": {"name": "Russian", "level": "beta"},
    "ar": {"name": "Arabic", "level": "beta"},
    "hi": {"name": "Hindi", "level": "beta"},
    "tr": {"name": "Turkish", "level": "beta"},
    "pl": {"name": "Polish", "level": "beta"},
    "vi": {"name": "Vietnamese", "level": "limited"},
    "th": {"name": "Thai", "level": "limited"},
    "id": {"name": "Indonesian", "level": "limited"},
    "sv": {"name": "Swedish", "level": "limited"},
    "no": {"name": "Norwegian", "level": "limited"},
    "da": {"name": "Danish", "level": "limited"},
    "fi": {"name": "Finnish", "level": "limited"},
    "uk": {"name": "Ukrainian", "level": "limited"},
    "cs": {"name": "Czech", "level": "limited"},
    "hu": {"name": "Hungarian", "level": "limited"},
    "ro": {"name": "Romanian", "level": "limited"},
    "bg": {"name": "Bulgarian", "level": "limited"},
    "he": {"name": "Hebrew", "level": "limited"},
    "el": {"name": "Greek", "level": "limited"},
    "ms": {"name": "Malay", "level": "limited"}
}

@router.get("/")
async def get_all_languages():
    """
    Get all supported languages with their support level.
    
    Returns:
        List of languages with support level
    """
    try:
        languages = []
        for code, data in LANGUAGE_SUPPORT.items():
            languages.append({
                "code": code,
                "name": data["name"],
                "level": data["level"]
            })
            
        # Sort languages by name
        languages.sort(key=lambda x: x["name"])
        
        return {"languages": languages, "count": len(languages)}
    except Exception as e:
        logger.error(f"Error retrieving languages: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve languages: {str(e)}")

@router.get("/supported")
async def get_supported_languages(
    level: Optional[str] = Query(None, description="Filter by support level (full, beta, limited)")
):
    """
    Get languages with specific support level.
    
    Args:
        level: Support level filter (full, beta, limited)
        
    Returns:
        List of languages with the specified support level
    """
    try:
        languages = []
        for code, data in LANGUAGE_SUPPORT.items():
            if level is None or data["level"] == level:
                languages.append({
                    "code": code,
                    "name": data["name"],
                    "level": data["level"]
                })
                
        # Sort languages by name
        languages.sort(key=lambda x: x["name"])
        
        return {"languages": languages, "count": len(languages)}
    except Exception as e:
        logger.error(f"Error retrieving supported languages: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve supported languages: {str(e)}")

@router.get("/recent")
async def get_recent_languages(
    user_id: str = Query(..., description="User ID to retrieve recent languages for")
):
    """
    Get recently used languages for a user.
    
    Args:
        user_id: User ID
        
    Returns:
        List of recently used languages
    """
    try:
        # Get recent languages from settings repository
        recent_languages_setting = settings_repository.get_setting(user_id, "recent_languages")
        
        if not recent_languages_setting or not recent_languages_setting.get("value"):
            return {"languages": [], "count": 0}
            
        # Parse JSON value
        try:
            recent_languages = json.loads(recent_languages_setting["value"])
        except json.JSONDecodeError:
            recent_languages = []
            
        if not isinstance(recent_languages, list):
            return {"languages": [], "count": 0}
            
        # Enrich with language details
        enriched_languages = []
        for code in recent_languages:
            if code in LANGUAGE_SUPPORT:
                enriched_languages.append({
                    "code": code,
                    "name": LANGUAGE_SUPPORT[code]["name"],
                    "level": LANGUAGE_SUPPORT[code]["level"]
                })
                
        return {"languages": enriched_languages, "count": len(enriched_languages)}
    except Exception as e:
        logger.error(f"Error retrieving recent languages for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve recent languages: {str(e)}")

@router.post("/recent")
async def add_recent_language(
    user_id: str,
    language_code: str
):
    """
    Add a language to user's recent languages.
    
    Args:
        user_id: User ID
        language_code: Language code to add
        
    Returns:
        Updated list of recent languages
        
    Raises:
        HTTPException: If language code is invalid
    """
    try:
        # Validate language code
        if language_code not in LANGUAGE_SUPPORT:
            raise HTTPException(status_code=400, detail=f"Invalid language code: {language_code}")
            
        # Get current recent languages
        recent_languages_setting = settings_repository.get_setting(user_id, "recent_languages")
        
        if not recent_languages_setting or not recent_languages_setting.get("value"):
            recent_languages = []
        else:
            try:
                recent_languages = json.loads(recent_languages_setting["value"])
                if not isinstance(recent_languages, list):
                    recent_languages = []
            except json.JSONDecodeError:
                recent_languages = []
                
        # Add language to the start of the list and remove duplicates
        if language_code in recent_languages:
            recent_languages.remove(language_code)
        recent_languages.insert(0, language_code)
        
        # Keep only the 5 most recent languages
        recent_languages = recent_languages[:5]
        
        # Save updated recent languages
        settings_repository.save_setting(
            user_id=user_id,
            key="recent_languages",
            value=json.dumps(recent_languages)
        )
        
        # Return enriched list
        enriched_languages = []
        for code in recent_languages:
            enriched_languages.append({
                "code": code,
                "name": LANGUAGE_SUPPORT[code]["name"],
                "level": LANGUAGE_SUPPORT[code]["level"]
            })
            
        return {"languages": enriched_languages, "count": len(enriched_languages)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding recent language for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add recent language: {str(e)}")

@router.get("/{language_code}")
async def get_language(
    language_code: str
):
    """
    Get details for a specific language.
    
    Args:
        language_code: Language code
        
    Returns:
        Language details
        
    Raises:
        HTTPException: If language code is invalid
    """
    try:
        if language_code not in LANGUAGE_SUPPORT:
            raise HTTPException(status_code=404, detail=f"Language not found: {language_code}")
            
        return {
            "code": language_code,
            "name": LANGUAGE_SUPPORT[language_code]["name"],
            "level": LANGUAGE_SUPPORT[language_code]["level"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving language {language_code}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve language: {str(e)}")
