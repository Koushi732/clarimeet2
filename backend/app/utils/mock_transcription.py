#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Mock transcription service for Clarimeet

Provides simulated transcription functionality for development
and testing when real transcription services are not available.
"""

import asyncio
import random
import time
import logging
import uuid
from typing import Dict, List, Any, Optional
import json
import os
from datetime import datetime

# Logging setup
logger = logging.getLogger(__name__)

# Simulated transcription data
MOCK_PHRASES = [
    "Welcome to our meeting today.",
    "Let's discuss the quarterly results.",
    "Our revenue has increased by 15% compared to last quarter.",
    "The new product launch was successful.",
    "Customer feedback has been overwhelmingly positive.",
    "We need to address the supply chain issues.",
    "Team performance has been excellent this month.",
    "Let's focus on our strategic goals for next quarter.",
    "Marketing has proposed a new campaign.",
    "Development is on schedule for the next release.",
    "The budget allocation needs to be revised.",
    "Any questions before we proceed?",
    "I'd like to thank everyone for their contributions.",
    "Let's summarize the action items from today.",
    "We should follow up on this next week.",
    "The customer satisfaction metrics show improvement.",
    "Our competitors have launched a similar product.",
    "We need to improve our response time to market changes.",
    "The team has done an excellent job managing the project.",
    "Let's review our progress on the roadmap."
]

# Active mock transcription sessions
active_mock_sessions = {}

class MockTranscriptionSession:
    """Manages a mock transcription session with simulated transcriptions."""
    
    def __init__(self, session_id: str, interval: float = 3.0):
        self.session_id = session_id
        self.interval = interval
        self.active = True
        self.last_timestamp = time.time()
        self.used_phrases = set()
        self.transcript_buffer = []
        self.task = None
        
        # Storage for callbacks
        self.callbacks = []
    
    def start(self):
        """Start the mock transcription session."""
        self.task = asyncio.create_task(self._generate_transcriptions())
        return True
    
    def stop(self):
        """Stop the mock transcription session."""
        self.active = False
        if self.task:
            self.task.cancel()
        return True
    
    def add_callback(self, callback):
        """Add a callback to be called when new transcription is available."""
        self.callbacks.append(callback)
    
    def _get_random_phrase(self):
        """Get a random phrase that hasn't been used yet in this session."""
        available_phrases = [p for p in MOCK_PHRASES if p not in self.used_phrases]
        
        if not available_phrases:
            # Reset if we've used all phrases
            self.used_phrases.clear()
            available_phrases = MOCK_PHRASES
        
        phrase = random.choice(available_phrases)
        self.used_phrases.add(phrase)
        return phrase
    
    async def _generate_transcriptions(self):
        """Generate mock transcriptions at regular intervals."""
        try:
            while self.active:
                # Generate a mock transcription
                timestamp = time.time()
                transcription = {
                    "id": str(uuid.uuid4()),
                    "session_id": self.session_id,
                    "text": self._get_random_phrase(),
                    "timestamp": timestamp,
                    "confidence": random.uniform(0.75, 0.98)
                }
                
                # Add to buffer
                self.transcript_buffer.append(transcription)
                
                # Notify callbacks
                for callback in self.callbacks:
                    try:
                        await callback(transcription)
                    except Exception as e:
                        logger.error(f"Error in transcription callback: {e}")
                
                # Wait for next interval with some randomness
                await asyncio.sleep(self.interval + random.uniform(-0.5, 1.0))
                
        except asyncio.CancelledError:
            logger.info(f"Mock transcription task for session {self.session_id} was cancelled")
        except Exception as e:
            logger.error(f"Error in mock transcription generator: {e}")
    
    def get_transcripts(self) -> List[Dict[str, Any]]:
        """Get all transcripts generated in this session."""
        return self.transcript_buffer


# Public API functions

async def start_mock_transcription(session_id: str) -> bool:
    """Start a mock transcription session."""
    try:
        if session_id in active_mock_sessions:
            logger.warning(f"Mock transcription for session {session_id} already started")
            return True
        
        # Create and start a new session
        session = MockTranscriptionSession(session_id)
        active_mock_sessions[session_id] = session
        session.start()
        
        logger.info(f"Started mock transcription for session {session_id}")
        return True
    except Exception as e:
        logger.error(f"Error starting mock transcription: {e}")
        return False

async def stop_mock_transcription(session_id: str) -> bool:
    """Stop a mock transcription session."""
    try:
        if session_id not in active_mock_sessions:
            logger.warning(f"No mock transcription found for session {session_id}")
            return False
        
        # Stop the session
        session = active_mock_sessions[session_id]
        success = session.stop()
        
        # Save transcripts to file for debugging
        _save_mock_transcripts(session_id, session.get_transcripts())
        
        # Clean up
        del active_mock_sessions[session_id]
        
        logger.info(f"Stopped mock transcription for session {session_id}")
        return success
    except Exception as e:
        logger.error(f"Error stopping mock transcription: {e}")
        return False

async def add_mock_transcription_callback(session_id: str, callback) -> bool:
    """Add a callback to be notified of new transcriptions."""
    if session_id not in active_mock_sessions:
        logger.warning(f"No mock transcription found for session {session_id}")
        return False
    
    active_mock_sessions[session_id].add_callback(callback)
    return True

def get_mock_transcription_status(session_id: str) -> Dict[str, Any]:
    """Get the status of a mock transcription session."""
    if session_id in active_mock_sessions:
        session = active_mock_sessions[session_id]
        return {
            "session_id": session_id,
            "status": "active" if session.active else "inactive",
            "transcript_count": len(session.transcript_buffer),
            "duration": time.time() - session.last_timestamp
        }
    else:
        return {
            "session_id": session_id,
            "status": "not_found"
        }

def _save_mock_transcripts(session_id: str, transcripts: List[Dict[str, Any]]):
    """Save mock transcripts to a file for debugging."""
    try:
        # Create directory if it doesn't exist
        debug_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "debug")
        os.makedirs(debug_dir, exist_ok=True)
        
        # Create filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"mock_transcription_{session_id}_{timestamp}.json"
        filepath = os.path.join(debug_dir, filename)
        
        # Save to file
        with open(filepath, 'w') as f:
            json.dump(transcripts, f, indent=2)
            
        logger.info(f"Saved mock transcripts to {filepath}")
    except Exception as e:
        logger.error(f"Error saving mock transcripts: {e}")
