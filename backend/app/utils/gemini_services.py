#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Google Gemini API Services for Clarimeet

Provides summarization and chat capabilities using Google's Gemini API (free tier).
"""

import asyncio
import logging
import os
import time
import uuid
import json
import threading
from typing import Dict, List, Optional, Any, Callable

import aiohttp

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set API key from environment variable
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL = "gemini-1.5-pro"

class GeminiSummarizationSession:
    """Summarization session using Google Gemini API"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.started = False
        self.callbacks: List[Callable] = []
        self.thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.summary_updates = 0
        self.transcript_buffer = ""
        self.last_summary_time = 0
        self.summary_interval = 30  # seconds between summaries
        self.api_key = GEMINI_API_KEY
        
    def add_callback(self, callback: Callable) -> None:
        """Add a callback to be called when a summary is generated"""
        self.callbacks.append(callback)
    
    def start(self) -> None:
        """Start the summarization session"""
        if self.started or not self.api_key:
            return
        
        self.started = True
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._generate_summaries)
        self.thread.daemon = True
        self.thread.start()
        logger.info(f"Started Gemini summarization session {self.session_id}")
    
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
                len(self.transcript_buffer.strip()) > 200):  # Need enough content to summarize
                
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
        """Create a summary of the current transcript using Gemini API"""
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
        """Generate a bullet-point summary using Gemini API"""
        prompt = f"""
        You are an AI assistant that creates clear, concise bullet-point summaries of meeting transcripts.
        
        Below is a transcript from a meeting. Create a bullet-point summary that:
        1. Captures the key points and main ideas
        2. Identifies any action items, decisions, or follow-ups
        3. Is clear, concise, and well-organized
        
        Meeting Transcript:
        {text}
        
        Format your response as a JSON object with two arrays:
        1. "key_points": A list of the main discussion points
        2. "action_items": A list of tasks, action items, or follow-ups
        
        Don't include any explanations or text outside the JSON structure.
        """
        
        response = await self._call_gemini_api(prompt)
        
        # Process the response
        try:
            # Try to parse the JSON from the response text
            content = self._extract_json_from_text(response)
            
            # Ensure proper structure
            if isinstance(content, dict):
                if "key_points" not in content:
                    content["key_points"] = []
                if "action_items" not in content:
                    content["action_items"] = []
                
                # Format key points as bullet points if they're not already
                content["key_points"] = [
                    point if point.startswith("•") else f"• {point}" 
                    for point in content["key_points"]
                ]
                
                # Format action items as bullet points if they're not already
                content["action_items"] = [
                    item if item.startswith("•") else f"• {item}" 
                    for item in content["action_items"]
                ]
                
                return content
            else:
                return {
                    "key_points": [f"• {response[:100]}..."],
                    "action_items": []
                }
        except Exception as e:
            logger.error(f"Error processing bullet summary response: {e}")
            return {
                "key_points": [f"• Summary of the meeting discussion"],
                "action_items": []
            }
    
    async def _generate_paragraph_summary(self, text: str) -> Dict[str, Any]:
        """Generate a paragraph summary using Gemini API"""
        prompt = f"""
        You are an AI assistant that creates clear, concise paragraph summaries of meeting transcripts.
        
        Below is a transcript from a meeting. Create a paragraph summary that:
        1. Captures the key points and main ideas discussed
        2. Flows naturally as a coherent paragraph
        3. Is between 3-5 sentences long
        
        Meeting Transcript:
        {text}
        
        Provide just the summary paragraph without any additional text, headers, or formatting.
        """
        
        response = await self._call_gemini_api(prompt)
        
        # Return the paragraph summary
        return {"text": response.strip()}
    
    async def _generate_structured_summary(self, text: str) -> Dict[str, Any]:
        """Generate a structured summary with topics using Gemini API"""
        prompt = f"""
        You are an AI assistant that creates structured summaries of meeting transcripts.
        
        Below is a transcript from a meeting. Create a structured summary that:
        1. Provides an overall summary of the meeting
        2. Identifies the main topics discussed
        3. For each topic, provides key points, any decisions made, and any action items
        
        Meeting Transcript:
        {text}
        
        Format your response as a JSON object with:
        1. "overall": A brief overall summary (1-2 sentences)
        2. "topics": An object where each key is a topic name and each value is an object with:
           a. "summary": A brief summary of the discussion on this topic
           b. "decisions": A list of decisions made (empty if none)
           c. "action_items": A list of action items related to this topic (empty if none)
        
        Don't include any explanations or text outside the JSON structure.
        """
        
        response = await self._call_gemini_api(prompt)
        
        # Process the response
        try:
            # Try to parse the JSON from the response text
            content = self._extract_json_from_text(response)
            
            # Ensure proper structure
            if isinstance(content, dict):
                if "overall" not in content:
                    content["overall"] = "Meeting summary not available"
                if "topics" not in content:
                    content["topics"] = {"General Discussion": {"summary": "Topic details not available", "decisions": [], "action_items": []}}
                
                # Ensure each topic has the required fields
                for topic, topic_data in content["topics"].items():
                    if "summary" not in topic_data:
                        topic_data["summary"] = ""
                    if "decisions" not in topic_data:
                        topic_data["decisions"] = []
                    if "action_items" not in topic_data:
                        topic_data["action_items"] = []
                    
                    # Format decisions and action items as bullet points if they're not already
                    topic_data["decisions"] = [
                        item if item.startswith("•") else f"• {item}" 
                        for item in topic_data["decisions"]
                    ]
                    
                    topic_data["action_items"] = [
                        item if item.startswith("•") else f"• {item}" 
                        for item in topic_data["action_items"]
                    ]
                
                return content
            else:
                return {
                    "overall": response[:200] if len(response) > 200 else response,
                    "topics": {"General Discussion": {"summary": "Topic details not available", "decisions": [], "action_items": []}}
                }
        except Exception as e:
            logger.error(f"Error processing structured summary response: {e}")
            return {
                "overall": "Meeting included several discussion points",
                "topics": {"General Discussion": {"summary": "Discussion details unavailable", "decisions": [], "action_items": []}}
            }
    
    async def _call_gemini_api(self, prompt: str) -> str:
        """Call the Gemini API and return the response text"""
        if not self.api_key:
            return "API key not set. Summary unavailable."
        
        url = f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent?key={self.api_key}"
        
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 800
            }
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Gemini API error: {error_text}")
                        return "Error generating summary. Please try again later."
                    
                    data = await response.json()
                    
                    # Extract the text from the response
                    if "candidates" in data and data["candidates"]:
                        candidate = data["candidates"][0]
                        if "content" in candidate and "parts" in candidate["content"]:
                            parts = candidate["content"]["parts"]
                            if parts and "text" in parts[0]:
                                return parts[0]["text"]
                    
                    return "Error parsing API response"
        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            return "Error connecting to Gemini API"
    
    def _extract_json_from_text(self, text: str) -> Dict[str, Any]:
        """Extract JSON from text that might have additional content"""
        # Try to find JSON block in the text
        json_start = text.find('{')
        json_end = text.rfind('}')
        
        if json_start >= 0 and json_end > json_start:
            json_text = text[json_start:json_end+1]
            try:
                return json.loads(json_text)
            except json.JSONDecodeError:
                pass
        
        # If we couldn't extract valid JSON, try cleaning the text
        # Remove markdown code block syntax
        cleaned_text = text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            # Return a simple dict as fallback
            return {"text": text}

class GeminiChatService:
    """Chat service using Google Gemini API"""
    
    def __init__(self):
        self.api_key = GEMINI_API_KEY
        self.session_contexts = {}
    
    async def generate_response(self, session_id: str, message: str, 
                               transcript: str = "", summary: str = "") -> str:
        """
        Generate a chat response for the given message using Gemini API.
        
        Args:
            session_id: The ID of the session
            message: The user's message
            transcript: Optional recent transcript for context
            summary: Optional meeting summary for context
            
        Returns:
            The generated response
        """
        if not self.api_key:
            return "I'm currently in offline mode and can't generate AI responses. Please check if the API key is configured."
        
        # Initialize session context if needed
        if session_id not in self.session_contexts:
            self.session_contexts[session_id] = {
                "history": [],
                "meeting_topic": None
            }
        
        context = self.session_contexts[session_id]
        
        # Extract meeting topic if not already known
        if not context["meeting_topic"] and transcript:
            context["meeting_topic"] = await self._extract_topic(transcript)
        
        # Prepare the context for the prompt
        context_text = ""
        if context["meeting_topic"]:
            context_text += f"This is a meeting about: {context['meeting_topic']}\n\n"
        
        # Add summary if available
        if summary:
            summary_text = ""
            if isinstance(summary, dict) and "content" in summary:
                if "text" in summary["content"]:
                    summary_text = summary["content"]["text"]
                elif "overall" in summary["content"]:
                    summary_text = summary["content"]["overall"]
            
            if summary_text:
                context_text += f"Meeting summary: {summary_text}\n\n"
        
        # Add transcript excerpt if available (just a small portion for context)
        if transcript:
            # Limit to last 500 characters to avoid token limits
            excerpt = transcript[-500:] if len(transcript) > 500 else transcript
            context_text += f"Recent transcript: {excerpt}\n\n"
        
        # Build the prompt with conversation history (last 3 exchanges)
        history = context["history"][-3:] if context["history"] else []
        
        conversation = []
        for item in history:
            conversation.append({"role": "user", "parts": [{"text": item["user"]}]})
            conversation.append({"role": "model", "parts": [{"text": item["assistant"]}]})
        
        # Add the current message
        prompt = f"""
        You are a helpful AI assistant for Clarimeet, a meeting transcription and summarization app.
        
        Answer the user's question based on the available context. Be helpful, concise, and accurate.
        If you don't know something or don't have enough context, admit it rather than making things up.
        
        {context_text}
        
        User message: {message}
        """
        
        # Send request to Gemini API
        response = await self._call_gemini_api(prompt, conversation)
        
        # Update conversation history
        context["history"].append({
            "user": message,
            "assistant": response
        })
        
        return response
    
    async def _extract_topic(self, transcript: str) -> str:
        """Extract the main topic from the transcript using Gemini API"""
        if not transcript or len(transcript) < 50:
            return "general discussion"
        
        prompt = f"""
        Below is a transcript from a meeting. In 5 words or fewer, what is the main topic of this meeting?
        
        Transcript:
        {transcript[:1000]}  # Limit to first 1000 chars
        
        Answer with ONLY the topic, no explanations or extra text.
        """
        
        response = await self._call_gemini_api(prompt, [])
        
        # Clean up the response
        topic = response.strip()
        if len(topic) > 50:
            topic = topic[:50] + "..."
        
        return topic
    
    async def _call_gemini_api(self, prompt: str, conversation_history: List[Dict[str, Any]]) -> str:
        """Call the Gemini API and return the response text"""
        if not self.api_key:
            return "API key not set. Chat response unavailable."
        
        url = f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent?key={self.api_key}"
        
        # Prepare the request content
        contents = []
        
        # Add conversation history if available
        if conversation_history:
            contents.extend(conversation_history)
        
        # Add the current prompt
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "topP": 0.9,
                "topK": 40,
                "maxOutputTokens": 500
            }
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Gemini API error: {error_text}")
                        return "I encountered an error processing your request. Please try again later."
                    
                    data = await response.json()
                    
                    # Extract the text from the response
                    if "candidates" in data and data["candidates"]:
                        candidate = data["candidates"][0]
                        if "content" in candidate and "parts" in candidate["content"]:
                            parts = candidate["content"]["parts"]
                            if parts and "text" in parts[0]:
                                return parts[0]["text"]
                    
                    return "I had trouble generating a response. Please try again with a different question."
        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            return "I'm having trouble connecting to my knowledge system right now. Please try again shortly."

class GeminiSummarizationService:
    """Free summarization service using Google Gemini API"""
    
    def __init__(self):
        self.sessions: Dict[str, GeminiSummarizationSession] = {}
    
    def create_session(self, session_id: str) -> GeminiSummarizationSession:
        """Create a new summarization session"""
        if session_id in self.sessions:
            return self.sessions[session_id]
        
        session = GeminiSummarizationSession(session_id)
        self.sessions[session_id] = session
        return session
    
    def get_session(self, session_id: str) -> Optional[GeminiSummarizationSession]:
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
        session = GeminiSummarizationSession(temp_session_id)
        
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
            simple_content = {"text": "Unable to generate summary at this time."}
            
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

# Create singleton instances
summarization_service = GeminiSummarizationService()
chat_service = GeminiChatService()
