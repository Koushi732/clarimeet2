#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Transcription schemas for Clariimeet

Defines Pydantic models for transcription data validation and serialization.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class TranscriptionBase(BaseModel):
    """
    Base model for transcription data.
    """
    session_id: str
    text: str
    timestamp: float = Field(..., ge=0)
    end_timestamp: Optional[float] = Field(None, ge=0)
    speaker: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0, le=1)


class TranscriptionCreate(TranscriptionBase):
    """
    Model for creating a new transcription.
    """
    pass


class TranscriptionUpdate(BaseModel):
    """
    Model for updating an existing transcription.
    """
    text: Optional[str] = None
    timestamp: Optional[float] = Field(None, ge=0)
    end_timestamp: Optional[float] = Field(None, ge=0)
    speaker: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0, le=1)


class TranscriptionResponse(TranscriptionBase):
    """
    Model for transcription response.
    """
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


class TranscriptionResult(BaseModel):
    """
    Model for real-time transcription results.
    """
    session_id: str
    text: str
    timestamp: float
    end_timestamp: Optional[float] = None
    is_final: bool = False
    confidence: Optional[float] = None
    speaker: Optional[str] = None

    def dict(self, *args, **kwargs):
        # Include the is_final flag in the JSON output
        result = super().dict(*args, **kwargs)
        return result
