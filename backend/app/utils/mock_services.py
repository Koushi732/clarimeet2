"""Mock services to replace ML-dependent components for prototype submission"""

import random
import time
import json
from datetime import datetime

# Mock transcription service
def generate_mock_transcription(audio_length=60):
    sample_phrases = [
        "Thank you for joining today's meeting.",
        "Let's discuss the project timeline.",
        "I think we should focus on the core features first.",
        "The client requested additional changes to the UI.",
        "We need to address the performance issues before release.",
        "Testing should begin next week.",
        "Are there any questions about the implementation?",
        "Let's schedule a follow-up meeting next Friday."
    ]
    
    # Generate random transcription segments
    transcription = []
    current_time = 0
    
    while current_time < audio_length:
        segment_length = random.uniform(3, 8)  # Random segment between 3-8 seconds
        phrase = random.choice(sample_phrases)
        
        transcription.append({
            "text": phrase,
            "start_time": current_time,
            "end_time": current_time + segment_length,
            "confidence": random.uniform(0.75, 0.98)
        })
        
        current_time += segment_length
    
    return transcription

# Mock summarization service
def generate_mock_summary(transcription=None, summary_type="overall"):
    summary_templates = {
        "overall": "This meeting covered project timelines, core features, UI changes requested by the client, and addressing performance issues before release. A follow-up meeting was scheduled for next Friday.",
        "key_points": "• Discussed project timeline\n• Focus on core features first\n• Client requested UI changes\n• Need to address performance issues\n• Testing starts next week\n• Follow-up meeting scheduled",
        "action_items": "1. Begin work on core features\n2. Implement UI changes requested by client\n3. Fix performance issues\n4. Prepare for testing next week\n5. Attend follow-up meeting on Friday"
    }
    
    return {
        "text": summary_templates.get(summary_type, summary_templates["overall"]),
        "summary_type": summary_type,
        "created_at": datetime.now().isoformat(),
        "model": "mock-summarizer-v1"
    }

# Mock audio recording service
def get_mock_audio_devices():
    return [
        {"id": "default", "name": "Default System Microphone", "isInput": True, "isOutput": False, "isLoopback": False, "isDefault": True},
        {"id": "loopback", "name": "System Audio (Loopback)", "isInput": True, "isOutput": False, "isLoopback": True, "isDefault": False},
        {"id": "headset", "name": "Headset Microphone", "isInput": True, "isOutput": False, "isLoopback": False, "isDefault": False},
        {"id": "speakers", "name": "System Speakers", "isInput": False, "isOutput": True, "isLoopback": False, "isDefault": True}
    ]
