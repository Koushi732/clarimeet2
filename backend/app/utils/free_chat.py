#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Free Chat Service for Clarimeet

Provides chatbot capabilities without requiring paid API services.
"""

import asyncio
import logging
import os
import time
import threading
import uuid
import re
import json
import random
from typing import Dict, List, Optional, Any, Set, Callable

try:
    import torch
    from transformers import pipeline, AutoModelForCausalLM, AutoTokenizer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

try:
    import nltk
    from nltk.tokenize import sent_tokenize
    NLTK_AVAILABLE = True
    
    # Download necessary NLTK data
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt', quiet=True)
except ImportError:
    NLTK_AVAILABLE = False

logger = logging.getLogger(__name__)

# Check if GPU is available
DEVICE = "cuda:0" if TRANSFORMERS_AVAILABLE and torch.cuda.is_available() else "cpu"

class FreeChatService:
    """Chat service using locally available models or rule-based responses"""
    
    def __init__(self, model_name="facebook/blenderbot-400M-distill"):
        """
        Initialize the chat service.
        Args:
            model_name: Name of the model to use, if Transformers is available
        """
        self.model = None
        self.tokenizer = None
        self.session_contexts = {}
        
        # Try to load model if transformers is available
        if TRANSFORMERS_AVAILABLE:
            try:
                logger.info(f"Loading chat model {model_name}")
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModelForCausalLM.from_pretrained(model_name)
                
                # Move to the appropriate device
                if DEVICE != "cpu":
                    self.model = self.model.to(DEVICE)
                
                logger.info(f"Chat model loaded successfully on {DEVICE}")
            except Exception as e:
                logger.error(f"Failed to load chat model: {e}")
                self.model = None
                self.tokenizer = None
    
    async def generate_response(self, session_id: str, message: str, 
                               transcript: str = "", summary: str = "") -> str:
        """
        Generate a chat response for the given message.
        
        Args:
            session_id: The ID of the session
            message: The user's message
            transcript: Optional recent transcript for context
            summary: Optional meeting summary for context
            
        Returns:
            The generated response
        """
        # Initialize session context if needed
        if session_id not in self.session_contexts:
            self.session_contexts[session_id] = {
                "history": [],
                "meeting_topic": None
            }
        
        # Check for meeting topic if not already known
        if not self.session_contexts[session_id]["meeting_topic"] and transcript:
            self.session_contexts[session_id]["meeting_topic"] = self._extract_topic(transcript)
        
        # Check if we have transformers available and a model loaded
        if self.model and self.tokenizer:
            try:
                # Try to use the model
                return await self._generate_model_response(session_id, message, transcript, summary)
            except Exception as e:
                logger.error(f"Error generating model response: {e}")
                # Fall back to rule-based response
        
        # Use rule-based response generation
        return await self._generate_rule_based_response(session_id, message, transcript, summary)
    
    async def _generate_model_response(self, session_id: str, message: str, 
                                     transcript: str, summary: str) -> str:
        """Generate a response using the loaded model"""
        context = self.session_contexts[session_id]
        
        # Add context about the meeting if available
        prompt = ""
        if context["meeting_topic"]:
            prompt += f"This is a meeting about {context['meeting_topic']}. "
        
        if summary:
            # Add summary as context but keep it concise
            summary_text = summary
            if isinstance(summary, dict) and "content" in summary:
                if "text" in summary["content"]:
                    summary_text = summary["content"]["text"]
                elif "overall" in summary["content"]:
                    summary_text = summary["content"]["overall"]
            
            if isinstance(summary_text, str):
                # Truncate if too long
                if len(summary_text) > 100:
                    summary_text = summary_text[:100] + "..."
                prompt += f"Meeting summary: {summary_text} "
        
        # Add chat history (last 3 exchanges)
        history = context["history"][-3:] if context["history"] else []
        for item in history:
            prompt += f"User: {item['user']}\nAssistant: {item['assistant']}\n"
        
        # Add current message
        prompt += f"User: {message}\nAssistant:"
        
        # Generate response using the model
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._run_model_inference(prompt)
        )
        
        # Update context with the new exchange
        context["history"].append({
            "user": message,
            "assistant": response
        })
        
        return response
    
    def _run_model_inference(self, prompt: str) -> str:
        """Run the model inference for chat"""
        try:
            if not self.model or not self.tokenizer:
                return "I'm sorry, I can't chat right now as the model isn't available."
            
            # Encode the prompt
            inputs = self.tokenizer(prompt, return_tensors="pt")
            if DEVICE != "cpu":
                inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
            
            # Generate a response
            outputs = self.model.generate(
                inputs["input_ids"],
                max_length=150,
                num_return_sequences=1,
                temperature=0.8,
                top_p=0.9,
                pad_token_id=self.tokenizer.eos_token_id
            )
            
            # Decode the response
            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Extract just the assistant's reply
            assistant_reply = response.split("Assistant:")[-1].strip()
            
            # If something went wrong and we got nothing, provide a default
            if not assistant_reply:
                return "I'm here to help with your meeting. What can I do for you?"
            
            return assistant_reply
        except Exception as e:
            logger.error(f"Error in model inference: {e}")
            return "I'm having trouble processing that right now. Can you try a different question?"
    
    async def _generate_rule_based_response(self, session_id: str, message: str, 
                                          transcript: str, summary: str) -> str:
        """Generate a response using rules when no model is available"""
        # Convert message to lowercase for easier matching
        msg_lower = message.lower()
        
        # Meeting topic extraction
        context = self.session_contexts[session_id]
        if not context["meeting_topic"] and transcript:
            context["meeting_topic"] = self._extract_topic(transcript)
        
        # Check for specific question types
        
        # Summary request
        if re.search(r'(summary|summarize|summarization|recap)', msg_lower):
            return self._get_summary_response(summary)
        
        # Questions about the meeting topic
        if re.search(r'(what is this meeting about|meeting topic|subject of this meeting|what are we discussing)', msg_lower):
            if context["meeting_topic"]:
                return f"This meeting appears to be about {context['meeting_topic']}."
            else:
                return "I don't have enough information yet to determine the meeting topic."
        
        # Questions about transcription
        if re.search(r'(transcription|transcript|transcribe)', msg_lower):
            return "I'm transcribing this meeting in real-time. The transcript will be available for review and export when the meeting ends."
        
        # Help request
        if re.search(r'(help|assist|support|what can you do|your capabilities|how do you work)', msg_lower):
            return ("I can help with your meeting in several ways:\n"
                   "- Provide meeting summaries\n"
                   "- Answer questions about the discussion\n"
                   "- Take notes or action items\n"
                   "- Help clarify points from the meeting\n"
                   "Just ask me what you need!")
        
        # Action items
        if re.search(r'(action items|tasks|to-do|follow up|next steps)', msg_lower):
            return self._get_action_items_response(summary, transcript)
        
        # Note taking
        if re.search(r'(take a note|write this down|remember this|note that)', msg_lower):
            note = re.sub(r'(take a note|write this down|remember this|note that)', '', message, flags=re.IGNORECASE).strip()
            if note:
                if "notes" not in context:
                    context["notes"] = []
                context["notes"].append(note)
                return f"I've noted: \"{note}\""
            else:
                return "What would you like me to note down?"
        
        # Show notes
        if re.search(r'(show notes|what notes|read notes|my notes)', msg_lower):
            if "notes" in context and context["notes"]:
                notes_text = "\n".join([f"- {note}" for note in context["notes"]])
                return f"Here are your notes:\n{notes_text}"
            else:
                return "You don't have any notes yet. Would you like me to take some notes for you?"
        
        # Fallback responses - choose randomly from options
        return random.choice([
            "I'm here to help with your meeting. How can I assist you?",
            "What specific information about the meeting would you like to know?",
            "I can provide summaries or answer questions about the discussion. What do you need?",
            "I'm monitoring the meeting and can answer questions or provide assistance. What would you like?",
            f"This meeting seems to be about {context['meeting_topic'] if context['meeting_topic'] else 'various topics'}. How can I help?"
        ])
    
    def _extract_topic(self, transcript: str) -> Optional[str]:
        """Extract the main topic from the transcript"""
        if not transcript or len(transcript) < 10:
            return None
        
        if not NLTK_AVAILABLE:
            # Very simple topic extraction - first sentence
            first_sentence = transcript.split(".")[0].strip()
            return first_sentence[:30] + "..." if len(first_sentence) > 30 else first_sentence
        
        try:
            # Split into sentences
            sentences = sent_tokenize(transcript)
            if not sentences:
                return None
            
            # Use the first few sentences to determine topic
            opening = " ".join(sentences[:min(3, len(sentences))])
            
            # Look for topic indicators
            topic_matches = re.search(r'(meeting|discuss|talk|agenda|topic|focus|about) ([\w\s]+)', opening, re.IGNORECASE)
            if topic_matches:
                topic = topic_matches.group(2).strip()
                # Limit length
                return topic[:50] + "..." if len(topic) > 50 else topic
            
            # Default to first sentence
            return sentences[0][:50] + "..." if len(sentences[0]) > 50 else sentences[0]
        except Exception as e:
            logger.error(f"Error extracting topic: {e}")
            return None
    
    def _get_summary_response(self, summary: Any) -> str:
        """Generate a response about the meeting summary"""
        if not summary:
            return "I don't have a summary of the meeting yet. Once more of the meeting is transcribed, I can provide one."
        
        try:
            # Extract summary content based on type
            if isinstance(summary, str):
                return f"Here's a summary of the meeting so far: {summary}"
            
            if isinstance(summary, dict):
                if "content" in summary:
                    content = summary["content"]
                    
                    # Paragraph summary
                    if isinstance(content, dict) and "text" in content:
                        return f"Here's a summary of the meeting so far: {content['text']}"
                    
                    # Bullet point summary
                    if isinstance(content, dict) and "key_points" in content:
                        points = "\n".join(content["key_points"][:5])
                        return f"Here are the key points from the meeting so far:\n{points}"
                    
                    # Structured summary
                    if isinstance(content, dict) and "overall" in content:
                        return f"Here's a summary of the meeting so far: {content['overall']}"
            
            # Fallback
            return "I have a summary of the meeting, but I'm having trouble formatting it. You can check the summary panel for details."
        except Exception as e:
            logger.error(f"Error generating summary response: {e}")
            return "I have some information about the meeting, but I'm having trouble processing it right now."
    
    def _get_action_items_response(self, summary: Any, transcript: str) -> str:
        """Generate a response about action items"""
        action_items = []
        
        # Try to extract from summary
        if isinstance(summary, dict) and "content" in summary:
            content = summary["content"]
            
            # From bullet point summary
            if isinstance(content, dict) and "action_items" in content:
                action_items.extend(content["action_items"])
            
            # From structured summary
            if isinstance(content, dict) and "topics" in content:
                for topic_name, topic_data in content["topics"].items():
                    if "action_items" in topic_data:
                        action_items.extend(topic_data["action_items"])
        
        # If no action items found, try to extract from transcript
        if not action_items and transcript:
            # Simple pattern matching for action items
            sentences = sent_tokenize(transcript) if NLTK_AVAILABLE else transcript.split(".")
            for sentence in sentences:
                if re.search(r'(action item|task|todo|follow up|need to|should|must|will|going to)', sentence.lower()):
                    item = sentence.strip()
                    if item and len(item) > 10:  # Avoid very short items
                        action_items.append(f"• {item}")
        
        # Format response
        if action_items:
            items_text = "\n".join(action_items[:5])  # Limit to 5 items
            if len(action_items) > 5:
                items_text += f"\n(and {len(action_items) - 5} more...)"
            return f"Here are the action items identified from the meeting:\n{items_text}"
        else:
            return "I haven't identified any specific action items from the meeting yet. As the discussion continues, I'll keep track of potential tasks or follow-ups."

# Create a singleton instance
chat_service = FreeChatService()
