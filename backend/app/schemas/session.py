#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Session schemas for Clariimeet

Defines Pydantic models for session data validation and serialization.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID


class SessionBase(BaseModel):
    """
    Base model for session data.
    """
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_live: bool = Field(default=False)
    duration: Optional[float] = Field(None, ge=0)
    audio_path: Optional[str] = None


class SessionCreate(SessionBase):
    """
    Model for creating a new session.
    """
    pass


class SessionUpdate(BaseModel):
    """
    Model for updating an existing session.
    """
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_live: Optional[bool] = None
    duration: Optional[float] = Field(None, ge=0)
    audio_path: Optional[str] = None


class SessionResponse(SessionBase):
    """
    Model for session response.
    """
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionList(BaseModel):
    """
    Model for a list of sessions.
    """
    sessions: List[SessionResponse]
    count: int
    total: int

    class Config:
        from_attributes = True
