#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SQLAlchemy Database Models for Clarimeet

Provides the SQLAlchemy Base class and database connection for ORM models.
"""

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database file path
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
DB_FILE = os.path.join(DB_DIR, "clarimeet_sqlalchemy.db")

# Ensure the data directory exists
os.makedirs(DB_DIR, exist_ok=True)

# Create SQLAlchemy engine
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_FILE}"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Function to initialize models
def init_models():
    Base.metadata.create_all(bind=engine)
    logger.info(f"SQLAlchemy models initialized at {DB_FILE}")
