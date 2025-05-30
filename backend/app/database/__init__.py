"""
Database package for Clarimeet application.

Provides database access to SQLite for storing transcriptions, summaries, and other data.
"""

from .database import get_db_connection, initialize_db
from .db_models import Base, get_db_session, init_models, engine, SessionLocal

# Create an alias for get_db_connection as get_db for compatibility
get_db = get_db_connection
from .session_repository import session_repository
from .transcription_repository import transcription_repository
from .summary_repository import summary_repository
from .speaker_repository import speaker_repository
from .chat_repository import chat_repository
from .settings_repository import settings_repository

# Export all repositories
__all__ = [
    'get_db_connection',
    'get_db',  # Added alias for compatibility
    'initialize_db',
    'Base',  # SQLAlchemy Base class
    'get_db_session',  # SQLAlchemy session dependency
    'init_models',  # SQLAlchemy model initialization
    'engine',  # SQLAlchemy engine
    'SessionLocal',  # SQLAlchemy session factory
    'session_repository',
    'transcription_repository',
    'summary_repository',
    'speaker_repository',
    'chat_repository',
    'settings_repository'
]
