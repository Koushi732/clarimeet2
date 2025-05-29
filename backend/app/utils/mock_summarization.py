#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Mock summarization service for Clarimeet

Provides simulated summarization functionality for development
and testing when real summarization services are not available.
"""

import asyncio
import random
import time
import logging
import uuid
from typing import Dict, List, Any, Optional, Tuple
import json
import os
from datetime import datetime

# Logging setup
logger = logging.getLogger(__name__)

# Active mock summarization sessions
active_mock_sessions = {}

class MockSummarizationSession:
    """Manages a mock summarization session with simulated summaries."""
    
    def __init__(self, session_id: str, interval: float = 15.0):
        self.session_id = session_id
        self.interval = interval
        self.active = True
        self.start_time = time.time()
        self.summary_buffer = []
        self.task = None
        
        # Storage for callbacks
        self.callbacks = []
        
        # Predefined summary templates
        self.templates = [
            "The meeting began with {topic}. The team discussed {point1} and {point2}.",
            "Key points from the discussion: {point1}, {point2}, and {point3}.",
            "The team reviewed {topic}. Main takeaways include {point1} and {point2}.",
            "Progress update: {point1}. Next steps: {point2} and {point3}.",
            "Discussion focused on {topic}. Action items: {point1} and {point2}."
        ]
        
        # Predefined topics and points
        self.topics = [
            "quarterly results",
            "project timeline",
            "marketing strategy",
            "customer feedback",
            "product development",
            "budget planning",
            "team performance",
            "market trends",
            "competitive analysis",
            "operational efficiency"
        ]
        
        self.points = [
            "revenue increased by 15%",
            "project is on schedule",
            "new marketing campaign launching next month",
            "customer satisfaction metrics improved",
        self.callbacks.append(callback)
        
    def start(self) -> None:
        """
        Start the summarization session
        """
        if self.started:
            return
            
        self.started = True
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._generate_summaries)
        self.thread.daemon = True
        self.thread.start()
        logger.info(f"Started summarization session {self.session_id}")
        
    def stop(self) -> None:
        """
        Stop the summarization session
        """
        if not self.started:
            return
            
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2.0)
        self.started = False
        logger.info(f"Stopped summarization session {self.session_id}")
    
    def add_transcript(self, text: str) -> None:
        """
        Add transcript text to the buffer for summarization
        """
        self.transcript_buffer += "\n" + text
        
    def _generate_summaries(self) -> None:
        """
        Generate summaries at regular intervals
        """
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
        """
        Create a real summary using OpenAI/LangChain
        """
        # Select summary type based on update count for variety
        summary_types = ["bullet_points", "paragraph", "structured"]
        summary_type = summary_types[self.summary_updates % len(summary_types)]
        
        text_to_summarize = self.transcript_buffer
        
        # Use appropriate method based on summary type
        if USE_OPENAI:
            if summary_type == "bullet_points":
                content = await self._generate_bullet_summary(text_to_summarize)
            elif summary_type == "structured":
                content = await self._generate_structured_summary(text_to_summarize)
            else:  # paragraph
                content = await self._generate_paragraph_summary(text_to_summarize)
        else:
            # Fallback simple summarization
            content = self._fallback_summarize(text_to_summarize, summary_type)
        
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
        """
        Generate a bullet-point summary using LangChain
        """
        # Prepare the text for processing
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200
        )
        texts = text_splitter.split_text(text)
        docs = [Document(page_content=t) for t in texts]
        
        # Create bullet-point summary
        prompt_template = """
        Write a concise bullet-point summary of the following meeting transcript.
        Include key points and any action items mentioned.
        Format the output as a JSON object with two lists: 'key_points' and 'action_items'.
        
        Transcript: {text}
        
        Output JSON:
        """
        
        prompt = PromptTemplate(template=prompt_template, input_variables=["text"])
        
        chain = load_summarize_chain(
            llm,
            chain_type="stuff",
            prompt=prompt
        )
        
        result = await chain.arun(docs)
        
        try:
            # Parse the JSON from the response
            result = result.strip()
            if result.startswith("```json"):
                result = result[7:]
            if result.endswith("```"):
                result = result[:-3]
                
            content = json.loads(result)
            
            # Ensure the expected structure
            if "key_points" not in content:
                content["key_points"] = []
            if "action_items" not in content:
                content["action_items"] = []
                
            return content
        except json.JSONDecodeError:
            # If JSON parsing fails, create a simple format
            logger.warning("Failed to parse JSON from bullet summary response")
            return {
                "key_points": [result.strip()],
                "action_items": []
            }
    
    async def _generate_paragraph_summary(self, text: str) -> Dict[str, Any]:
        """
        Generate a paragraph summary using LangChain
        """
        # Prepare the text for processing
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200
        )
        texts = text_splitter.split_text(text)
        docs = [Document(page_content=t) for t in texts]
        
        # Create paragraph summary
        prompt_template = """
        Write a concise paragraph summary of the following meeting transcript:
        
        {text}
        
        Summary:
        """
        
        prompt = PromptTemplate(template=prompt_template, input_variables=["text"])
        
        chain = load_summarize_chain(
            llm,
            chain_type="stuff",
            prompt=prompt
        )
        
        result = await chain.arun(docs)
        
        return {"text": result.strip()}
    
    async def _generate_structured_summary(self, text: str) -> Dict[str, Any]:
        """
        Generate a structured summary with topics using LangChain
        """
        # Prepare the text for processing
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200
        )
        texts = text_splitter.split_text(text)
        docs = [Document(page_content=t) for t in texts]
        
        # Create structured summary
        prompt_template = """
        Analyze the following meeting transcript and create a structured summary.
        Identify the main topics discussed, provide a brief summary for each topic, 
        and list any action items or decisions made.
        
        Format the output as a JSON object with:
        1. 'overall' - a brief overview of the meeting
        2. 'topics' - an object where keys are topic names and values are objects containing:
           - 'summary': brief summary of the topic discussion
           - 'action_items': list of action items related to this topic
           - 'decisions': list of decisions made about this topic
        
        Transcript: {text}
        
        Output JSON:
        """
        
        prompt = PromptTemplate(template=prompt_template, input_variables=["text"])
        
        chain = load_summarize_chain(
            llm,
            chain_type="stuff",
            prompt=prompt
        )
        
        result = await chain.arun(docs)
        
        try:
            # Parse the JSON from the response
            result = result.strip()
            if result.startswith("```json"):
                result = result[7:]
            if result.endswith("```"):
                result = result[:-3]
                
            content = json.loads(result)
            
            # Ensure the expected structure
            if "overall" not in content:
                content["overall"] = "Meeting summary not available"
            if "topics" not in content:
                content["topics"] = {}
                
            return content
        except json.JSONDecodeError:
            # If JSON parsing fails, create a simple format
            logger.warning("Failed to parse JSON from structured summary response")
            return {
                "overall": result.strip(),
                "topics": {"General": {
                    "summary": result.strip(),
                    "action_items": [],
                    "decisions": []
                }}
            }
    
    def _fallback_summarize(self, text: str, format_type: str) -> Dict[str, Any]:
        """
        Fallback summarization when OpenAI is not available
        """
        # Take first ~20% of the text as a simple summary
        if len(text) < 100:
            summary_text = text
        else:
            summary_length = max(50, len(text) // 5)
            summary_text = text[:summary_length] + "..."
        
        if format_type == "bullet_points":
            # Create simple bullet points by breaking the text
            sentences = summary_text.split('. ')
            bullet_points = [s.strip() + '.' for s in sentences if s.strip()]
            
            return {
                "key_points": bullet_points[:3],  # Limit to 3 points
                "action_items": []
            }
        elif format_type == "structured":
            return {
                "overall": summary_text,
                "topics": {
                    "Main Discussion": {
                        "summary": summary_text,
                        "action_items": [],
                        "decisions": []
                    }
                }
            }
        else:  # paragraph
            return {"text": summary_text}


class RealSummarizationService:
    """
    Real Summarization service using OpenAI and LangChain
    """
    def __init__(self):
        self.sessions: Dict[str, RealSummarizationSession] = {}
        
    def create_session(self, session_id: str) -> RealSummarizationSession:
        """
        Create a new summarization session
        """
        if session_id in self.sessions:
            return self.sessions[session_id]
            
        session = RealSummarizationSession(session_id)
        self.sessions[session_id] = session
        return session
        
    def get_session(self, session_id: str) -> Optional[RealSummarizationSession]:
        """
        Get an existing summarization session
        """
        return self.sessions.get(session_id)
        
    def close_session(self, session_id: str) -> None:
        """
        Close a summarization session
        """
        if session_id in self.sessions:
            session = self.sessions.pop(session_id)
            session.stop()
            
    async def generate_summary(self, text: str, format_type: str = "paragraph") -> Dict[str, Any]:
        """
        Generate a one-time summary for the given text
        """
        # Create a temporary session for this request
        temp_session_id = f"temp_{uuid.uuid4()}"
        session = RealSummarizationSession(temp_session_id)
        
        try:
            # Prepare summary based on format type
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
            content = session._fallback_summarize(text, format_type)
            return {
                "type": format_type,
                "content": content,
                "timestamp": time.time(),
                "id": str(uuid.uuid4()),
                "error": str(e)
            }

# Use the real implementation instead of mock
summarization_service = RealSummarizationService()

def _save_mock_summaries(session_id: str, summaries: List[Dict[str, Any]]):
    """Save mock summaries to a file for debugging."""
    try:
        # Create directory if it doesn't exist
        debug_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "debug")
        os.makedirs(debug_dir, exist_ok=True)
        
        # Create filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"mock_summarization_{session_id}_{timestamp}.json"
        filepath = os.path.join(debug_dir, filename)
        
        # Save to file
        with open(filepath, 'w') as f:
            json.dump(summaries, f, indent=2)
            
        logger.info(f"Saved mock summaries to {filepath}")
    except Exception as e:
        logger.error(f"Error saving mock summaries: {e}")
