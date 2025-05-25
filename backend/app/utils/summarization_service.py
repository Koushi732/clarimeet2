#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Summarization Service for Clariimeet

Provides functionality for generating summaries of transcribed text using
both extractive and abstractive methods.
"""

import os
import time
import threading
import logging
import json
import uuid
from typing import Dict, List, Optional, Any, Tuple
import queue

# Import for summarization
try:
    from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    SPACY_AVAILABLE = False

try:
    import nltk
    from nltk.tokenize import sent_tokenize
    from nltk.corpus import stopwords
    NLTK_AVAILABLE = True
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt')
    try:
        nltk.data.find('corpora/stopwords')
    except LookupError:
        nltk.download('stopwords')
except ImportError:
    NLTK_AVAILABLE = False

# Logging
logger = logging.getLogger(__name__)

# Active summarization processes
active_summarizations = {}
summarization_status = {}

# Callbacks for real-time updates
summary_callbacks = {}

# Summarization models cache
models_cache = {}

def _load_summarization_model(model_name: str):
    """Load a summarization model."""
    if not TRANSFORMERS_AVAILABLE:
        logger.error("Transformers is not installed")
        return None
    
    try:
        if model_name in models_cache:
            return models_cache[model_name]
        
        logger.info(f"Loading summarization model: {model_name}")
        
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
        summarizer = pipeline("summarization", model=model, tokenizer=tokenizer)
        
        models_cache[model_name] = summarizer
        return summarizer
    except Exception as e:
        logger.error(f"Error loading summarization model: {e}")
        return None

def _extract_keywords(text: str, num_keywords: int = 5) -> List[str]:
    """Extract keywords from text."""
    if not NLTK_AVAILABLE:
        logger.warning("NLTK is not installed, skipping keyword extraction")
        return []
    
    try:
        # Tokenize and convert to lowercase
        words = nltk.word_tokenize(text.lower())
        
        # Remove stopwords and non-alphabetic tokens
        stop_words = set(stopwords.words('english'))
        words = [word for word in words if word.isalpha() and word not in stop_words]
        
        # Count word frequencies
        freq_dist = nltk.FreqDist(words)
        
        # Get most common words
        keywords = [word for word, _ in freq_dist.most_common(num_keywords)]
        
        return keywords
    except Exception as e:
        logger.error(f"Error extracting keywords: {e}")
        return []

def _segment_text(text: str, max_length: int = 1024) -> List[str]:
    """Segment text into chunks for summarization."""
    if not NLTK_AVAILABLE:
        # Simple chunking by characters
        chunks = []
        for i in range(0, len(text), max_length):
            chunks.append(text[i:i + max_length])
        return chunks
    
    try:
        # Split into sentences
        sentences = sent_tokenize(text)
        
        # Group sentences into chunks
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk) + len(sentence) <= max_length:
                current_chunk += " " + sentence if current_chunk else sentence
            else:
                chunks.append(current_chunk)
                current_chunk = sentence
        
        # Add the last chunk if not empty
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks
    except Exception as e:
        logger.error(f"Error segmenting text: {e}")
        
        # Fallback to simple chunking
        chunks = []
        for i in range(0, len(text), max_length):
            chunks.append(text[i:i + max_length])
        return chunks

def _summarize_with_transformers(text: str, model_name: str = "bart-large-cnn", max_length: int = 150, min_length: int = 30) -> str:
    """Summarize text using Transformers."""
    try:
        if not text or len(text.strip()) < min_length:
            return ""
        
        # Load model
        summarizer = _load_summarization_model(model_name)
        if not summarizer:
            logger.error("Failed to load summarization model")
            return ""
        
        # Segment text if it's too long
        if len(text) > 1024:
            chunks = _segment_text(text)
            summaries = []
            
            for chunk in chunks:
                if not chunk or len(chunk.strip()) < min_length:
                    continue
                
                # Generate summary for this chunk
                try:
                    summary = summarizer(chunk, max_length=max_length, min_length=min_length, do_sample=False)[0]['summary_text']
                    summaries.append(summary)
                except Exception as chunk_e:
                    logger.error(f"Error summarizing chunk: {chunk_e}")
            
            # Combine summaries
            if summaries:
                combined_summary = " ".join(summaries)
                
                # If combined summary is still too long, summarize again
                if len(combined_summary) > 1024:
                    return _summarize_with_transformers(combined_summary, model_name, max_length, min_length)
                
                return combined_summary
            else:
                return ""
        else:
            # Generate summary directly
            summary = summarizer(text, max_length=max_length, min_length=min_length, do_sample=False)[0]['summary_text']
            return summary
    
    except Exception as e:
        logger.error(f"Error summarizing with transformers: {e}")
        return ""

def _summarize_with_extractive(text: str, sentences: int = 3) -> str:
    """Summarize text using extractive summarization."""
    try:
        if not text or len(text.strip()) < 100:
            return text
        
        if NLTK_AVAILABLE:
            # Split into sentences
            all_sentences = sent_tokenize(text)
            
            if len(all_sentences) <= sentences:
                return text
            
            # Extract keywords
            keywords = _extract_keywords(text, num_keywords=10)
            
            # Score sentences based on keyword occurrence
            scored_sentences = []
            
            for i, sentence in enumerate(all_sentences):
                score = 0
                for keyword in keywords:
                    if keyword.lower() in sentence.lower():
                        score += 1
                
                # Boost score for beginning sentences
                if i < len(all_sentences) // 3:
                    score += 1
                
                scored_sentences.append((i, sentence, score))
            
            # Sort by score
            scored_sentences.sort(key=lambda x: x[2], reverse=True)
            
            # Get top sentences
            top_sentences = scored_sentences[:sentences]
            
            # Sort by original position
            top_sentences.sort(key=lambda x: x[0])
            
            # Join sentences
            summary = " ".join(s[1] for s in top_sentences)
            
            return summary
        else:
            # Simple extractive - just take first few sentences
            words = text.split()
            word_count = min(100, len(words))
            summary = " ".join(words[:word_count])
            
            return summary
    
    except Exception as e:
        logger.error(f"Error summarizing with extractive method: {e}")
        return ""

def _save_summary(summary: str, session_id: str, summary_type: str, segment_start: Optional[float] = None, segment_end: Optional[float] = None, db=None) -> Optional[str]:
    """Save summary to the database."""
    try:
        from app.models.models import Summary
        from sqlalchemy.orm import Session
        
        # Check if db is a valid session
        if not db or not hasattr(db, 'add'):
            logger.error("Invalid database session")
            return None
        
        # Save to database
        db_summary = Summary(
            session_id=session_id,
            text=summary,
            summary_type=summary_type,
            segment_start=segment_start,
            segment_end=segment_end
        )
        
        db.add(db_summary)
        db.commit()
        db.refresh(db_summary)
        
        logger.info(f"Summary saved for session {session_id}")
        
        # Trigger callbacks for this session if any
        try:
            _trigger_summary_callbacks(session_id, {
                "id": db_summary.id,
                "session_id": session_id,
                "text": summary,
                "summary_type": summary_type,
                "segment_start": segment_start,
                "segment_end": segment_end,
                "created_at": db_summary.created_at.isoformat() if hasattr(db_summary.created_at, 'isoformat') else str(db_summary.created_at)
            })
        except Exception as e:
            logger.error(f"Error triggering summary callbacks: {e}")
        
        return db_summary.id
    
    except Exception as e:
        logger.error(f"Error saving summary: {e}")
        return None

def _summarize_incremental(session_id: str, db=None, interval_seconds: int = 60):
    """Summarize transcriptions incrementally."""
    try:
        from app.models.models import Transcription
        from sqlalchemy.orm import Session
        import datetime
        
        # Set status
        summarization_status[session_id] = {
            "status": "running",
            "summary_type": "incremental",
            "last_update": time.time(),
            "interval_seconds": interval_seconds
        }
        
        # Get start time
        start_time = time.time()
        last_summary_time = start_time
        
        # Main loop
        while session_id in active_summarizations and summarization_status[session_id]["status"] == "running":
            try:
                # Sleep until next interval
                time.sleep(1.0)
                
                # Check if it's time to generate a summary
                current_time = time.time()
                if current_time - last_summary_time < interval_seconds:
                    continue
                
                # Get new transcriptions since last summary
                if db and isinstance(db, Session):
                    # Get latest transcriptions
                    latest_transcriptions = db.query(Transcription).filter(
                        Transcription.session_id == session_id,
                        Transcription.created_at >= datetime.datetime.fromtimestamp(last_summary_time)
                    ).order_by(Transcription.timestamp).all()
                    
                    # Check if there are new transcriptions
                    if not latest_transcriptions:
                        continue
                    
                    # Combine transcriptions
                    combined_text = " ".join(t.text for t in latest_transcriptions)
                    
                    # Get time range
                    segment_start = latest_transcriptions[0].timestamp if latest_transcriptions else None
                    segment_end = latest_transcriptions[-1].end_timestamp if latest_transcriptions else None
                    
                    # Generate summary
                    if TRANSFORMERS_AVAILABLE:
                        summary = _summarize_with_transformers(combined_text)
                    else:
                        summary = _summarize_with_extractive(combined_text)
                    
                    # Save summary
                    if summary:
                        _save_summary(
                            summary=summary,
                            session_id=session_id,
                            summary_type="incremental",
                            segment_start=segment_start,
                            segment_end=segment_end,
                            db=db
                        )
                    
                    # Update last summary time
                    last_summary_time = current_time
                    
                    # Update status
                    summarization_status[session_id]["last_update"] = current_time
            except Exception as e:
                logger.error(f"Error in incremental summarization: {e}")
                time.sleep(5.0)  # Sleep on error to avoid tight loop
        
        # Clean up
        if session_id in summarization_status:
            summarization_status[session_id]["status"] = "stopped"
        
    except Exception as e:
        logger.error(f"Error in summarization thread: {e}")
        
        if session_id in summarization_status:
            summarization_status[session_id]["status"] = "error"
            summarization_status[session_id]["error"] = str(e)

def generate_summary(
    session_id: str,
    summary_type: str = "overall",
    model: str = "bart-large-cnn",
    segment_start: Optional[float] = None,
    segment_end: Optional[float] = None,
    db=None
) -> bool:
    """Generate a summary for a session."""
    try:
        # Import models here to avoid circular imports
        from app.models.models import Transcription
        from app.database import SessionLocal
        
        # Create a database session if not provided
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True
        
        try:
            # Set status
            summarization_status[session_id] = {
                "status": "processing",
                "summary_type": summary_type,
                "model": model,
                "last_update": time.time()
            }
            
            # Get transcriptions for the session
            transcription_query = db.query(Transcription).filter(
                Transcription.session_id == session_id
            ).order_by(Transcription.timestamp)
            
            # Apply time range filter if provided
            if segment_start is not None:
                transcription_query = transcription_query.filter(Transcription.timestamp >= segment_start)
            if segment_end is not None:
                transcription_query = transcription_query.filter(Transcription.timestamp <= segment_end)
            
            # Get all matching transcriptions
            transcriptions = transcription_query.all()
            
            if not transcriptions:
                logger.warning(f"No transcriptions found for session {session_id}")
                summarization_status[session_id]["status"] = "error"
                summarization_status[session_id]["error"] = "No transcriptions found"
                return False
            
            # Combine transcriptions
            combined_text = " ".join(t.text for t in transcriptions)
            
            # Generate summary
            summary = None
            if TRANSFORMERS_AVAILABLE:
                summary = _summarize_with_transformers(combined_text, model_name=model)
            else:
                summary = _summarize_with_extractive(combined_text)
            
            if not summary:
                logger.warning(f"Failed to generate summary for session {session_id}")
                summarization_status[session_id]["status"] = "error"
                summarization_status[session_id]["error"] = "Failed to generate summary"
                return False
            
            # Save summary
            summary_id = _save_summary(
                summary=summary,
                session_id=session_id,
                summary_type=summary_type,
                segment_start=segment_start or transcriptions[0].timestamp,
                segment_end=segment_end or transcriptions[-1].end_timestamp,
                db=db
            )
            
            # Update status
            summarization_status[session_id]["status"] = "completed"
            summarization_status[session_id]["last_update"] = time.time()
            
            return True
            
        finally:
            # Close the database session if we created it
            if close_db and db:
                db.close()
                
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        
        if session_id in summarization_status:
            summarization_status[session_id]["status"] = "error"
            summarization_status[session_id]["error"] = str(e)
        
        return False

def start_realtime_summarization(
    session_id: str,
    summary_type: str = "incremental",
    model: str = "bart-large-cnn",
    interval_seconds: int = 60
) -> bool:
    """Start real-time summarization for a session."""
    try:
        # Check if already summarizing
        if session_id in active_summarizations:
            logger.warning(f"Already summarizing for session {session_id}")
            return False
        
        # Import database here to avoid circular imports
        from app.database import SessionLocal
        
        # Create a database session
        db = SessionLocal()
        
        # Start summarization in a separate thread
        thread = threading.Thread(
            target=_summarize_incremental,
            args=(session_id, db, interval_seconds)
        )
        thread.daemon = True
        thread.start()
        
        # Store active summarization
        active_summarizations[session_id] = {
            "thread": thread,
            "db": db
        }
        
        # Wait for summarization to start
        time.sleep(0.5)
        
        # Check if summarization started successfully
        if session_id in summarization_status and summarization_status[session_id]["status"] == "running":
            return True
        else:
            # Clean up
            if db:
                db.close()
            return False
    except Exception as e:
        logger.error(f"Error starting real-time summarization: {e}")
        return False

def stop_realtime_summarization(session_id: str) -> bool:
    """Stop real-time summarization for a session."""
    try:
        # Check if summarizing
        if session_id not in active_summarizations:
            logger.warning(f"No active summarization for session {session_id}")
            return False
        
        # Update status
        if session_id in summarization_status:
            summarization_status[session_id]["status"] = "stopping"
        
        # Wait for thread to finish
        active_summarizations[session_id]["thread"].join(timeout=5.0)
        
        # Close database session
        if "db" in active_summarizations[session_id]:
            active_summarizations[session_id]["db"].close()
        
        # Remove from active summarizations
        del active_summarizations[session_id]
        
        # Update status
        if session_id in summarization_status:
            summarization_status[session_id]["status"] = "stopped"
        
        return True
    except Exception as e:
        logger.error(f"Error stopping real-time summarization: {e}")
        return False

def register_summary_callback(session_id: str, callback) -> str:
    """Register a callback for summary updates.
    
    Args:
        session_id: ID of the session to register callback for
        callback: Callable that will be called when a new summary is generated
        
    Returns:
        Callback ID if successful, None otherwise
    """
    try:
        if session_id not in summary_callbacks:
            summary_callbacks[session_id] = {}
        
        # Generate a unique callback ID
        callback_id = str(uuid.uuid4())
        
        summary_callbacks[session_id][callback_id] = callback
        logger.info(f"Registered summary callback for session {session_id}")
        
        return callback_id
    except Exception as e:
        logger.error(f"Error registering summary callback: {e}")
        return None

def unregister_summary_callback(session_id: str, callback_id: str) -> bool:
    """Unregister a callback for summary updates.
    
    Args:
        session_id: ID of the session to unregister callback for
        callback_id: ID of the callback to unregister
        
    Returns:
        True if unregistration was successful, False otherwise
    """
    try:
        if session_id in summary_callbacks and callback_id in summary_callbacks[session_id]:
            del summary_callbacks[session_id][callback_id]
            logger.info(f"Unregistered summary callback for session {session_id}")
            return True
        return False
    except Exception as e:
        logger.error(f"Error unregistering summary callback: {e}")
        return False

def _trigger_summary_callbacks(session_id: str, summary_data: Dict[str, Any]) -> None:
    """Trigger callbacks for a session.
    
    Args:
        session_id: ID of the session
        summary_data: Summary data to pass to callbacks
    """
    if session_id not in summary_callbacks:
        return
    
    # Use a separate thread to handle async callbacks
    def _handle_callbacks():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def _run_callbacks():
            for callback_id, callback in list(summary_callbacks[session_id].items()):
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(summary_data)
                    else:
                        callback(summary_data)
                except Exception as e:
                    logger.error(f"Error in summary callback {callback_id} for session {session_id}: {e}")
        
        try:
            loop.run_until_complete(_run_callbacks())
        finally:
            loop.close()
    
    # Run in a separate thread to avoid blocking
    callback_thread = threading.Thread(target=_handle_callbacks)
    callback_thread.daemon = True
    callback_thread.start()

def get_summarization_status(session_id: str) -> Dict[str, Any]:
    """Get summarization status for a session."""
    try:
        # Check if summarizing
        if session_id in summarization_status:
            return {
                "session_id": session_id,
                "status": summarization_status[session_id]["status"],
                "summary_type": summarization_status[session_id].get("summary_type"),
                "model": summarization_status[session_id].get("model"),
                "interval_seconds": summarization_status[session_id].get("interval_seconds")
            }
        else:
            return {
                "session_id": session_id,
                "status": "not_started"
            }
    except Exception as e:
        logger.error(f"Error getting summarization status: {e}")
        return {
            "session_id": session_id,
            "status": "error",
            "error": str(e)
        }
