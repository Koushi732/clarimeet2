#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Database Connection Manager for Clarimeet

Handles SQLite database connections and provides common database operations.
"""

import os
import logging
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from contextlib import contextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database file path
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
DB_FILE = os.path.join(DB_DIR, "clarimeet.db")

# Ensure the data directory exists
os.makedirs(DB_DIR, exist_ok=True)

def dict_factory(cursor, row):
    """Convert SQL row to dictionary with column names as keys"""
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = dict_factory
        yield conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise
    finally:
        if conn:
            conn.close()

def initialize_db():
    """Create tables if they don't exist"""
    logger.info(f"Initializing database at {DB_FILE}")
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Create Sessions table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            created_at INTEGER,
            updated_at INTEGER,
            duration INTEGER,
            status TEXT,
            language TEXT DEFAULT 'en',
            metadata TEXT
        )
        ''')
        
        # Create Transcriptions table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS transcriptions (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            text TEXT,
            is_final BOOLEAN,
            timestamp INTEGER,
            speaker_id TEXT,
            speaker_name TEXT,
            confidence REAL,
            start_time REAL,
            end_time REAL,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
        ''')
        
        # Create Summaries table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS summaries (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            content TEXT,
            type TEXT,
            created_at INTEGER,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
        ''')
        
        # Create Speakers table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS speakers (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            name TEXT,
            word_count INTEGER DEFAULT 0,
            talk_time REAL DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
        ''')
        
        # Create ChatMessages table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            sender TEXT,
            receiver TEXT,
            content TEXT,
            timestamp INTEGER,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
        ''')
        
        # Create UserSettings table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_settings (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            setting_key TEXT,
            setting_value TEXT,
            created_at INTEGER,
            updated_at INTEGER
        )
        ''')
        
        conn.commit()
        logger.info("Database initialized successfully")

# Initialize the database on import
initialize_db()
