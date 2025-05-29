#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Free Summarization Service for Clarimeet

Provides summarization capabilities using locally available models without API costs.
"""

import asyncio
import logging
import os
import time
import threading
import uuid
import json
import re
from typing import Dict, List, Optional, Any, Callable

try:
    import torch
    from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

try:
    import nltk
    from nltk.tokenize import sent_tokenize
    from nltk.corpus import stopwords
    NLTK_AVAILABLE = True
    
    # Download necessary NLTK data
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt', quiet=True)
    
    try:
        nltk.data.find('corpora/stopwords')
    except LookupError:
        nltk.download('stopwords', quiet=True)
except ImportError:
    NLTK_AVAILABLE = False

logger = logging.getLogger(__name__)

# Check if GPU is available
DEVICE = "cuda:0" if TRANSFORMERS_AVAILABLE and torch.cuda.is_available() else "cpu"

class FreeSummarizationSession:
    """Summarization session using free local models"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.started = False
        self.callbacks: List[Callable[[Dict[str, Any]], None]] = []
        self.thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.summary_updates = 0
        self.transcript_buffer = ""
        self.last_summary_time = 0
        self.summary_interval = 30  # seconds between summaries
        
        # Try to load summarization model if available
        self.model = None
        self.tokenizer = None
        if TRANSFORMERS_AVAILABLE:
            try:
                # Use smallest summarization model for efficiency
                model_name = "facebook/bart-large-cnn"
                logger.info(f"Loading summarization model {model_name}")
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
                
                # Move to the appropriate device
                if DEVICE != "cpu":
                    self.model = self.model.to(DEVICE)
                
                logger.info(f"Summarization model loaded successfully on {DEVICE}")
            except Exception as e:
                logger.error(f"Failed to load summarization model: {e}")
                self.model = None
                self.tokenizer = None
    
    def add_callback(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Add a callback to be called when a summary is generated"""
        self.callbacks.append(callback)
    
    def start(self) -> None:
        """Start the summarization session"""
        if self.started:
            return
        
        self.started = True
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._generate_summaries)
        self.thread.daemon = True
        self.thread.start()
        logger.info(f"Started summarization session {self.session_id}")
    
    def stop(self) -> None:
        """Stop the summarization session"""
        if not self.started:
            return
        
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2.0)
        self.started = False
        logger.info(f"Stopped summarization session {self.session_id}")
    
    def add_transcript(self, text: str) -> None:
        """Add transcript text to the buffer for summarization"""
        if text:
            self.transcript_buffer += "\n" + text
    
    def _generate_summaries(self) -> None:
        """Generate summaries at regular intervals"""
        while not self.stop_event.is_set():
            # Check if it's time for a summary and if we have enough transcript
            current_time = time.time()
            time_since_last = current_time - self.last_summary_time
            
            if (time_since_last >= self.summary_interval and 
                len(self.transcript_buffer.strip()) > 100):
                
                # Generate a summary
                try:
                    summary = asyncio.run(self._create_summary())
                    
                    # Call all callbacks
                    for callback in self.callbacks:
                        try:
                            callback(summary)
                        except Exception as e:
                            logger.error(f"Error in summary callback: {e}")
                    
                    self.summary_updates += 1
                    self.last_summary_time = current_time
                except Exception as e:
                    logger.error(f"Error generating summary: {e}")
            
            # Wait before checking again
            if self.stop_event.wait(1.0):  # Check every second
                break
    
    async def _create_summary(self) -> Dict[str, Any]:
        """Create a summary of the current transcript"""
        # Select summary type based on update count for variety
        summary_types = ["bullet_points", "paragraph", "structured"]
        summary_type = summary_types[self.summary_updates % len(summary_types)]
        
        text_to_summarize = self.transcript_buffer
        
        # Generate summary based on type
        if summary_type == "bullet_points":
            content = await self._generate_bullet_summary(text_to_summarize)
        elif summary_type == "structured":
            content = await self._generate_structured_summary(text_to_summarize)
        else:  # paragraph
            content = await self._generate_paragraph_summary(text_to_summarize)
        
        # Add metadata
        summary = {
            "type": summary_type,
            "content": content,
            "session_id": self.session_id,
            "timestamp": time.time(),
            "update_id": f"summary_{self.session_id}_{self.summary_updates}"
        }
        
        return summary
    
    async def _generate_bullet_summary(self, text: str) -> Dict[str, Any]:
        """Generate a bullet-point summary"""
        if self.model and self.tokenizer and TRANSFORMERS_AVAILABLE:
            try:
                # Use the transformer model
                return await self._model_bullet_summary(text)
            except Exception as e:
                logger.error(f"Error using model for bullet summary: {e}")
                # Fall back to extractive summarization
                return await self._extractive_bullet_summary(text)
        else:
            # Use extractive summarization for bullet points
            return await self._extractive_bullet_summary(text)
    
    async def _model_bullet_summary(self, text: str) -> Dict[str, Any]:
        """Generate a bullet-point summary using a transformer model"""
        # Truncate input if needed to fit model's max input
        max_length = 1024
        if len(text) > max_length:
            text = text[:max_length]
        
        # Run the model in a separate thread to avoid blocking
        loop = asyncio.get_event_loop()
        summary_text = await loop.run_in_executor(
            None,
            lambda: self._run_model_summary(text, max_length=100, min_length=30)
        )
        
        # Split into bullet points if not already formatted
        if not summary_text.strip().startswith("-") and not summary_text.strip().startswith("•"):
            bullet_points = [f"• {s.strip()}" for s in sent_tokenize(summary_text) if s.strip()]
        else:
            # Already in bullet format, just clean up
            bullet_points = [line.strip() for line in summary_text.split("\n") 
                            if line.strip() and (line.strip().startswith("-") or line.strip().startswith("•"))]
            # Ensure consistent bullet format
            bullet_points = [f"• {p[1:].strip()}" if p.startswith("-") else p for p in bullet_points]
        
        # Check for potential action items
        action_items = []
        for point in bullet_points[:]:
            text = point.lower()
            if ("action" in text or "task" in text or "todo" in text or 
                "follow up" in text or "schedule" in text or 
                "complete" in text or "finish" in text):
                action_items.append(point)
                # Don't remove from bullet points, it can appear in both
        
        return {
            "key_points": bullet_points,
            "action_items": action_items
        }
    
    async def _extractive_bullet_summary(self, text: str) -> Dict[str, Any]:
        """Generate bullet points using extractive summarization"""
        if not NLTK_AVAILABLE:
            # Very simple fallback
            sentences = text.split(". ")
            points = [f"• {s.strip()}" for s in sentences[:5] if len(s.strip()) > 20]
            return {
                "key_points": points[:3],
                "action_items": []
            }
        
        try:
            # Tokenize sentences
            sentences = sent_tokenize(text)
            
            # Simple scoring based on word frequency
            word_frequencies = {}
            stop_words = set(stopwords.words('english'))
            
            # Calculate word frequencies
            for sentence in sentences:
                for word in nltk.word_tokenize(sentence.lower()):
                    if word not in stop_words and word.isalnum():
                        word_frequencies[word] = word_frequencies.get(word, 0) + 1
            
            # Score sentences based on word frequencies
            sentence_scores = {}
            for i, sentence in enumerate(sentences):
                for word in nltk.word_tokenize(sentence.lower()):
                    if word in word_frequencies:
                        sentence_scores[i] = sentence_scores.get(i, 0) + word_frequencies[word]
            
            # Get top sentences
            top_indices = sorted(sentence_scores, key=sentence_scores.get, reverse=True)[:5]
            top_indices.sort()  # Sort by original order
            
            # Create bullet points
            bullet_points = [f"• {sentences[i].strip()}" for i in top_indices if sentences[i].strip()]
            
            # Check for potential action items
            action_items = []
            action_keywords = ["action", "task", "todo", "follow up", "schedule", "complete", "finish"]
            for i, sentence in enumerate(sentences):
                if any(keyword in sentence.lower() for keyword in action_keywords):
                    item = f"• {sentence.strip()}"
                    if item not in bullet_points:
                        action_items.append(item)
            
            return {
                "key_points": bullet_points,
                "action_items": action_items[:3]  # Limit to 3 action items
            }
            
        except Exception as e:
            logger.error(f"Error in extractive bullet summary: {e}")
            return {
                "key_points": [f"• {text[:100]}..."],
                "action_items": []
            }
    
    async def _generate_paragraph_summary(self, text: str) -> Dict[str, Any]:
        """Generate a paragraph summary"""
        if self.model and self.tokenizer and TRANSFORMERS_AVAILABLE:
            try:
                # Use the transformer model
                max_length = 1024
                if len(text) > max_length:
                    text = text[:max_length]
                
                # Run the model in a separate thread
                loop = asyncio.get_event_loop()
                summary_text = await loop.run_in_executor(
                    None,
                    lambda: self._run_model_summary(text, max_length=150, min_length=50)
                )
                
                return {"text": summary_text.strip()}
            except Exception as e:
                logger.error(f"Error using model for paragraph summary: {e}")
                # Fall back to extractive
        
        # Extractive paragraph summary
        return await self._extractive_paragraph_summary(text)
    
    async def _extractive_paragraph_summary(self, text: str) -> Dict[str, Any]:
        """Generate a paragraph using extractive summarization"""
        if not NLTK_AVAILABLE:
            # Very simple fallback
            if len(text) <= 200:
                return {"text": text}
            else:
                return {"text": text[:200] + "..."}
        
        try:
            # Tokenize sentences
            sentences = sent_tokenize(text)
            
            # For very short text, just return it
            if len(sentences) <= 3:
                return {"text": text}
            
            # Simple scoring based on word frequency
            word_frequencies = {}
            stop_words = set(stopwords.words('english'))
            
            # Calculate word frequencies
            for sentence in sentences:
                for word in nltk.word_tokenize(sentence.lower()):
                    if word not in stop_words and word.isalnum():
                        word_frequencies[word] = word_frequencies.get(word, 0) + 1
            
            # Normalize frequencies
            max_frequency = max(word_frequencies.values()) if word_frequencies else 1
            for word in word_frequencies:
                word_frequencies[word] = word_frequencies[word] / max_frequency
            
            # Score sentences
            sentence_scores = {}
            for i, sentence in enumerate(sentences):
                sentence_scores[i] = 0
                word_count = len(nltk.word_tokenize(sentence))
                if 3 <= word_count <= 30:  # Avoid very short or long sentences
                    for word in nltk.word_tokenize(sentence.lower()):
                        if word in word_frequencies:
                            sentence_scores[i] += word_frequencies[word]
            
            # Select top sentences (about 30% of original or at least 3)
            num_sentences = max(3, int(len(sentences) * 0.3))
            top_indices = sorted(sentence_scores, key=sentence_scores.get, reverse=True)[:num_sentences]
            top_indices.sort()  # Sort by original order
            
            # Create paragraph
            summary = " ".join([sentences[i].strip() for i in top_indices])
            
            return {"text": summary}
            
        except Exception as e:
            logger.error(f"Error in extractive paragraph summary: {e}")
            return {"text": text[:200] + "..." if len(text) > 200 else text}
    
    async def _generate_structured_summary(self, text: str) -> Dict[str, Any]:
        """Generate a structured summary with topics"""
        # For structured summary, we'll use a rule-based approach
        # as training topic modeling would be complex
        
        # First get a basic summary
        basic_summary = await self._extractive_paragraph_summary(text)
        
        # Try to identify topics by looking for repeated phrases and keywords
        topics = await self._extract_topics(text)
        
        # Format the result
        result = {
            "overall": basic_summary["text"],
            "topics": {}
        }
        
        # Add topic summaries
        for topic_name, topic_sentences in topics.items():
            # Join sentences for this topic
            topic_text = " ".join(topic_sentences)
            
            # Look for action items
            action_items = []
            for sentence in topic_sentences:
                if re.search(r'(action|task|todo|follow up|schedule|complete|finish)', sentence.lower()):
                    action = sentence.strip()
                    if not action.startswith("•"):
                        action = f"• {action}"
                    action_items.append(action)
            
            # Look for decisions
            decisions = []
            for sentence in topic_sentences:
                if re.search(r'(decide|decision|agreed|agreement|concluded|conclusion|determined)', sentence.lower()):
                    decision = sentence.strip()
                    if not decision.startswith("•"):
                        decision = f"• {decision}"
                    decisions.append(decision)
            
            # Add to result
            result["topics"][topic_name] = {
                "summary": topic_text,
                "action_items": action_items,
                "decisions": decisions
            }
        
        # Ensure we have at least one topic
        if not result["topics"]:
            result["topics"]["General Discussion"] = {
                "summary": basic_summary["text"],
                "action_items": [],
                "decisions": []
            }
        
        return result
    
    async def _extract_topics(self, text: str) -> Dict[str, List[str]]:
        """Extract topics from text using keyword frequency"""
        if not NLTK_AVAILABLE:
            return {"Main Topic": [text[:200] + "..." if len(text) > 200 else text]}
        
        try:
            # Tokenize sentences
            sentences = sent_tokenize(text)
            
            # Extract noun phrases as potential topics
            # This is a simple approach - a real implementation would use
            # more sophisticated NLP techniques
            
            # First get all words
            words = []
            for sentence in sentences:
                words.extend(nltk.word_tokenize(sentence.lower()))
            
            # Remove stopwords
            stop_words = set(stopwords.words('english'))
            filtered_words = [word for word in words if word.isalnum() and word not in stop_words]
            
            # Count word frequencies
            word_counts = {}
            for word in filtered_words:
                word_counts[word] = word_counts.get(word, 0) + 1
            
            # Get top words as potential topics
            potential_topics = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:10]
            
            # Group sentences by topic
            topics = {}
            assigned_sentences = set()
            
            for topic_word, _ in potential_topics:
                topic_sentences = []
                for i, sentence in enumerate(sentences):
                    if i not in assigned_sentences and topic_word in sentence.lower():
                        topic_sentences.append(sentence)
                        assigned_sentences.add(i)
                
                # Only keep topics with enough content
                if len(topic_sentences) >= 2:
                    # Capitalize topic name
                    topic_name = topic_word.capitalize()
                    topics[topic_name] = topic_sentences
            
            # Add remaining sentences to a "General" topic
            general_sentences = [sentences[i] for i in range(len(sentences)) if i not in assigned_sentences]
            if general_sentences:
                topics["General"] = general_sentences
            
            return topics
            
        except Exception as e:
            logger.error(f"Error extracting topics: {e}")
            return {"Main Topic": [text[:200] + "..." if len(text) > 200 else text]}
    
    def _run_model_summary(self, text: str, max_length=100, min_length=30) -> str:
        """Run the transformer model for summarization"""
        if not self.model or not self.tokenizer:
            return text[:200] + "..." if len(text) > 200 else text
        
        try:
            inputs = self.tokenizer(text, return_tensors="pt", max_length=1024, truncation=True)
            if DEVICE != "cpu":
                inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
            
            # Generate summary
            summary_ids = self.model.generate(
                inputs["input_ids"], 
                max_length=max_length, 
                min_length=min_length, 
                num_beams=4, 
                early_stopping=True
            )
            summary = self.tokenizer.decode(summary_ids[0], skip_special_tokens=True)
            return summary
        except Exception as e:
            logger.error(f"Error running model summary: {e}")
            return text[:200] + "..." if len(text) > 200 else text

class FreeSummarizationService:
    """Free summarization service using local models"""
    
    def __init__(self):
        self.sessions: Dict[str, FreeSummarizationSession] = {}
    
    def create_session(self, session_id: str) -> FreeSummarizationSession:
        """Create a new summarization session"""
        if session_id in self.sessions:
            return self.sessions[session_id]
        
        session = FreeSummarizationSession(session_id)
        self.sessions[session_id] = session
        return session
    
    def get_session(self, session_id: str) -> Optional[FreeSummarizationSession]:
        """Get an existing summarization session"""
        return self.sessions.get(session_id)
    
    def close_session(self, session_id: str) -> None:
        """Close a summarization session"""
        if session_id in self.sessions:
            session = self.sessions.pop(session_id)
            session.stop()
    
    async def generate_summary(self, text: str, format_type: str = "paragraph") -> Dict[str, Any]:
        """Generate a one-time summary for the given text"""
        # Create a temporary session for this request
        temp_session_id = f"temp_{uuid.uuid4()}"
        session = FreeSummarizationSession(temp_session_id)
        
        try:
            # Add the text to the session
            session.add_transcript(text)
            
            # Generate appropriate summary based on format type
            if format_type == "bullet_points":
                content = await session._generate_bullet_summary(text)
            elif format_type == "structured":
                content = await session._generate_structured_summary(text)
            else:  # paragraph
                content = await session._generate_paragraph_summary(text)
            
            return {
                "type": format_type,
                "content": content,
                "timestamp": time.time(),
                "id": str(uuid.uuid4())
            }
        except Exception as e:
            logger.error(f"Error generating summary: {e}")
            # Fallback to simple summarization
            simple_content = {"text": text[:200] + "..." if len(text) > 200 else text}
            
            return {
                "type": format_type,
                "content": simple_content,
                "timestamp": time.time(),
                "id": str(uuid.uuid4()),
                "error": str(e)
            }
        finally:
            # Clean up the temporary session
            session.stop()

# Create a singleton instance
summarization_service = FreeSummarizationService()
