from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

# Base Schemas
class AudioDevice(BaseModel):
    id: str
    name: str
    is_input: bool
    is_default: bool
    is_loopback: Optional[bool] = False

    class Config:
        from_attributes = True

class TranscriptionBase(BaseModel):
    timestamp: float
    end_timestamp: Optional[float] = None
    text: str
    confidence: Optional[float] = 0.0
    speaker: Optional[str] = None

class Transcription(TranscriptionBase):
    id: str
    session_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class SummaryBase(BaseModel):
    summary_type: str
    text: str
    segment_start: Optional[float] = None
    segment_end: Optional[float] = None

class Summary(SummaryBase):
    id: str
    session_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class SessionBase(BaseModel):
    title: str
    description: Optional[str] = None

class SessionCreate(SessionBase):
    pass

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class Session(SessionBase):
    id: str
    created_at: datetime
    updated_at: datetime
    duration: float
    audio_path: Optional[str] = None
    is_live: bool

    class Config:
        from_attributes = True

class SessionDetail(Session):
    transcriptions: List[Transcription]
    summaries: List[Summary]

class SessionExport(BaseModel):
    session: Dict[str, Any]
    transcriptions: List[Dict[str, Any]]
    summaries: List[Dict[str, Any]]

# Status Schemas
class RecordingStatus(BaseModel):
    session_id: str
    is_recording: bool
    duration: float
    audio_level: float

class TranscriptionStatus(BaseModel):
    session_id: str
    status: str
    model: Optional[str] = None
    language: Optional[str] = None

class SummarizationStatus(BaseModel):
    session_id: str
    status: str
    summary_type: Optional[str] = None
    model: Optional[str] = None
    interval_seconds: Optional[int] = None

# WebSocket Message Schemas
class WebSocketMessage(BaseModel):
    type: str
    data: Dict[str, Any]

class TranscriptionUpdate(BaseModel):
    session_id: str
    transcription: Transcription

class SummaryUpdate(BaseModel):
    session_id: str
    summary: Summary

class AudioLevelUpdate(BaseModel):
    session_id: str
    level: float
    timestamp: float

# Settings Schema
class AppSettings(BaseModel):
    theme: str = "dark"
    language: str = "en"
    transcription_model: str = "whisper-small"
    summarization_model: str = "bart-large-cnn"
    auto_save: bool = True
    auto_transcribe: bool = True
    auto_summarize: bool = True

    class Config:
        from_attributes = True
