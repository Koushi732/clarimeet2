from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
import datetime
from app.database import Base
import uuid

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    duration = Column(Float, default=0)  # Duration in seconds
    audio_path = Column(String, nullable=True)  # Path to the stored audio file
    is_live = Column(Boolean, default=False)  # Whether this was a live session or uploaded file
    
    # Relationships
    transcriptions = relationship("Transcription", back_populates="session", cascade="all, delete-orphan")
    summaries = relationship("Summary", back_populates="session", cascade="all, delete-orphan")
    transcription_status = relationship("TranscriptionStatus", back_populates="session", cascade="all, delete-orphan", uselist=False)

class Transcription(Base):
    __tablename__ = "transcriptions"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"))
    timestamp = Column(Float)  # Start time in seconds
    end_timestamp = Column(Float, nullable=True)  # End time in seconds
    text = Column(Text)
    confidence = Column(Float, default=0.0)
    speaker = Column(String, nullable=True)  # For speaker diarization
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationship
    session = relationship("Session", back_populates="transcriptions")

class Summary(Base):
    __tablename__ = "summaries"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"))
    summary_type = Column(String, index=True)  # e.g., "overall", "segment", "action_items", etc.
    text = Column(Text)
    segment_start = Column(Float, nullable=True)  # Start time in seconds for segmented summaries
    segment_end = Column(Float, nullable=True)  # End time in seconds for segmented summaries
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationship
    session = relationship("Session", back_populates="summaries")

class AudioDevice(Base):
    __tablename__ = "audio_devices"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    device_name = Column(String, index=True)
    device_id = Column(String, unique=True)
    is_input = Column(Boolean, default=True)  # True for input, False for output
    is_default = Column(Boolean, default=False)
    is_loopback = Column(Boolean, default=False)  # For system audio capture
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    theme = Column(String, default="dark")
    language = Column(String, default="en")
    transcription_model = Column(String, default="whisper-small")
    summarization_model = Column(String, default="bart-large-cnn")
    auto_save = Column(Boolean, default=True)
    auto_transcribe = Column(Boolean, default=True)
    auto_summarize = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class TranscriptionStatus(Base):
    __tablename__ = "transcription_status"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"))
    status = Column(String, default="idle")  # idle, transcribing, completed, error
    model = Column(String, nullable=True)
    language = Column(String, nullable=True)
    progress = Column(Float, default=0.0)
    error = Column(Text, nullable=True)
    last_update = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationship
    session = relationship("Session", back_populates="transcription_status")

