#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Configuration for Clariimeet

Defines settings and configuration for the application, with support for
environment variables and different deployment environments.
"""

import os
import secrets
from typing import List, Optional, Dict, Any, Union

# Handle Pydantic v1 vs v2 imports
try:
    # Pydantic v2
    from pydantic_settings import BaseSettings
    from pydantic import Field
except ImportError:
    # Fallback to Pydantic v1
    from pydantic import BaseSettings, Field

class Settings(BaseSettings):
    """
    Application settings with environment variable support.
    
    Attributes are loaded from environment variables with the same name,
    or fallback to the default values defined here.
    """
    # Basic app config
    APP_NAME: str = "Clariimeet"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = Field(default="development", env="ENVIRONMENT")
    DEBUG: bool = Field(default=True, env="DEBUG")
    
    # API settings
    API_PREFIX: str = "/api"
    SECRET_KEY: str = Field(
        default=secrets.token_urlsafe(32),
        env="SECRET_KEY"
    )
    
    # CORS settings
    CORS_ORIGINS: List[str] = ["*"]
    CORS_ALLOW_CREDENTIALS: bool = True
    
    # Database settings
    DATABASE_URL: str = Field(
        default="sqlite:///./clariimeet.db",
        env="DATABASE_URL"
    )
    
    # Transcription settings
    WHISPER_MODEL: str = Field(default="base", env="WHISPER_MODEL")
    TRANSCRIPTION_CHUNK_SIZE_MS: int = Field(default=5000, env="TRANSCRIPTION_CHUNK_SIZE_MS")
    DEVICE: Optional[str] = Field(default=None, env="DEVICE")  # "cpu", "cuda", etc.
    TRANSCRIPTION_LANGUAGE: str = Field(default="en", env="TRANSCRIPTION_LANGUAGE")
    
    # Summarization settings
    SUMMARIZATION_MODEL: str = Field(default="bart-large-cnn", env="SUMMARIZATION_MODEL")
    MAX_SUMMARY_LENGTH: int = Field(default=150, env="MAX_SUMMARY_LENGTH")
    MIN_SUMMARY_LENGTH: int = Field(default=30, env="MIN_SUMMARY_LENGTH")
    
    # Audio recording settings
    AUDIO_SAMPLE_RATE: int = Field(default=16000, env="AUDIO_SAMPLE_RATE")
    AUDIO_CHANNELS: int = Field(default=1, env="AUDIO_CHANNELS")
    AUDIO_FORMAT: str = Field(default="wav", env="AUDIO_FORMAT")
    
    # File upload settings
    UPLOADS_DIR: str = Field(
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads"),
        env="UPLOADS_DIR"
    )
    MAX_UPLOAD_SIZE_MB: int = Field(default=100, env="MAX_UPLOAD_SIZE_MB")
    SUPPORTED_AUDIO_FORMATS: List[str] = ["mp3", "wav", "m4a", "aac", "ogg", "flac"]
    AUTO_TRANSCRIBE_UPLOADS: bool = Field(default=True, env="AUTO_TRANSCRIBE_UPLOADS")
    
    # WebSocket settings
    WS_PING_INTERVAL: float = Field(default=20.0, env="WS_PING_INTERVAL")
    WS_PING_TIMEOUT: float = Field(default=20.0, env="WS_PING_TIMEOUT")
    MAX_PENDING_MESSAGES: int = Field(default=100, env="MAX_PENDING_MESSAGES")
    
    # Export settings
    ENABLE_PDF_EXPORT: bool = Field(default=True, env="ENABLE_PDF_EXPORT")
    
    # OS-specific audio capture settings
    # Windows settings
    WINDOWS_LOOPBACK_BUFFER_MS: int = Field(default=100, env="WINDOWS_LOOPBACK_BUFFER_MS")
    
    # macOS settings
    MACOS_AUDIO_DEVICE: Optional[str] = Field(default=None, env="MACOS_AUDIO_DEVICE")
    
    # Linux settings
    LINUX_PULSE_SOURCE: Optional[str] = Field(default=None, env="LINUX_PULSE_SOURCE")
    
    # API Keys
    OPENAI_API_KEY: str = Field(default="your_openai_api_key", env="OPENAI_API_KEY")
    HUGGINGFACE_API_KEY: str = Field(default="your_huggingface_api_key", env="HUGGINGFACE_API_KEY")
    TEXTRAZOR_API_KEY: str = Field(default="your_textrazor_api_key", env="TEXTRAZOR_API_KEY")
    COHERE_API_KEY: str = Field(default="your_cohere_api_key", env="COHERE_API_KEY")
    DEEPGRAM_API_KEY: str = Field(default="your_deepgram_api_key", env="DEEPGRAM_API_KEY")
    ASSEMBLYAI_API_KEY: str = Field(default="your_assemblyai_api_key", env="ASSEMBLYAI_API_KEY")
    
    # Database settings (additional)
    SUPABASE_URL: str = Field(default="your_supabase_url", env="SUPABASE_URL")
    SUPABASE_KEY: str = Field(default="your_supabase_key", env="SUPABASE_KEY")
    
    # Service provider settings
    DEFAULT_TRANSCRIPTION_PROVIDER: str = Field(default="openai", env="DEFAULT_TRANSCRIPTION_PROVIDER")
    DEFAULT_SUMMARIZATION_PROVIDER: str = Field(default="huggingface", env="DEFAULT_SUMMARIZATION_PROVIDER")
    DEFAULT_CHATBOT_PROVIDER: str = Field(default="openai", env="DEFAULT_CHATBOT_PROVIDER")
    DEFAULT_KEYWORD_PROVIDER: str = Field(default="textrazor", env="DEFAULT_KEYWORD_PROVIDER")
    USE_CLOUD_STORAGE: bool = Field(default=False, env="USE_CLOUD_STORAGE")
    
    class Config:
        env_file = ".env"
        case_sensitive = True

# Instantiate settings
settings = Settings()

# Create uploads directory if it doesn't exist
os.makedirs(settings.UPLOADS_DIR, exist_ok=True)

# Adjust settings based on environment
if settings.ENVIRONMENT.lower() == "production":
    settings.DEBUG = False

# Helper functions
def get_environment_info() -> Dict[str, Any]:
    """
    Get information about the current environment configuration.
    
    Returns:
        Dictionary with environment settings
    """
    return {
        "app_name": settings.APP_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
        "database": settings.DATABASE_URL.split("://")[0] if "://" in settings.DATABASE_URL else "sqlite",
        "whisper_model": settings.WHISPER_MODEL,
        "device": settings.DEVICE or "auto",
        "summarization_model": settings.SUMMARIZATION_MODEL,
    }
