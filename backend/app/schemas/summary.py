#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Summary schemas for Clariimeet

Defines Pydantic models for summary data validation and serialization.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class SummaryBase(BaseModel):
    """
    Base model for summary data.
    """
    session_id: str
    text: str
    summary_type: str = Field(default="overall")
    segment_start: Optional[float] = Field(None, ge=0)
    segment_end: Optional[float] = Field(None, ge=0)


class SummaryCreate(SummaryBase):
    """
    Model for creating a new summary.
    """
    pass


class SummaryUpdate(BaseModel):
    """
    Model for updating an existing summary.
    """
    text: Optional[str] = None
    summary_type: Optional[str] = None
    segment_start: Optional[float] = Field(None, ge=0)
    segment_end: Optional[float] = Field(None, ge=0)


class SummaryResponse(SummaryBase):
    """
    Model for summary response.
    """
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


class SummaryResult(BaseModel):
    """
    Model for real-time summary results.
    """
    session_id: str
    text: str
    summary_type: str
    segment_start: Optional[float] = None
    segment_end: Optional[float] = None
    is_final: bool = True

    class Config:
        from_attributes = True
