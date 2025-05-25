#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
System Audio Capture Module for Clariimeet

This module handles OS-specific system audio capture methods:
- Windows: WASAPI Loopback via PyAudio
- macOS: BlackHole/Soundflower audio routing
- Linux: PulseAudio loopback

Provides a unified interface for capturing system audio regardless of platform.
"""

import os
import sys
import time
import wave
import tempfile
import logging
import platform
import threading
import subprocess
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union, BinaryIO, Generator, Any
from enum import Enum
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Default audio parameters
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_CHANNELS = 1
DEFAULT_FORMAT = 'int16'
DEFAULT_CHUNK_SIZE = 1024

# Buffer for real-time processing
AUDIO_BUFFER_SECONDS = 30

class AudioFormat(Enum):
    """Supported audio formats for capture and processing"""
    PCM_16 = 'int16'
    PCM_24 = 'int24'
    PCM_32 = 'int32'
    FLOAT_32 = 'float32'

class AudioDevice:
    """Represents an audio device with its properties"""
    def __init__(self, 
                 id: str, 
                 name: str, 
                 is_input: bool = False, 
                 is_output: bool = False,
                 is_loopback: bool = False,
                 is_default: bool = False,
                 sample_rates: List[int] = None,
                 channels: List[int] = None):
        self.id = id
        self.name = name
        self.is_input = is_input
        self.is_output = is_output
        self.is_loopback = is_loopback
        self.is_default = is_default
        self.sample_rates = sample_rates or [DEFAULT_SAMPLE_RATE]
        self.channels = channels or [DEFAULT_CHANNELS]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert device to dictionary for API responses"""
        return {
            "id": self.id,
            "name": self.name,
            "is_input": self.is_input,
            "is_output": self.is_output,
            "is_loopback": self.is_loopback,
            "is_default": self.is_default,
            "sample_rates": self.sample_rates,
            "channels": self.channels
        }

# Platform detection for OS-specific implementations
OS_TYPE = platform.system().lower()

class SystemAudioCapture:
    """Base class for system audio capture"""
    def __init__(self, sample_rate=DEFAULT_SAMPLE_RATE, channels=DEFAULT_CHANNELS, 
                 format=DEFAULT_FORMAT, chunk_size=DEFAULT_CHUNK_SIZE):
        self.sample_rate = sample_rate
        self.channels = channels
        self.format = format
        self.chunk_size = chunk_size
        self._recording = False
        self._stream = None
        self._audio_buffer = []
        self._audio_buffer_lock = threading.Lock()
        self._recording_thread = None
        self._setup_complete = False
        
    def setup(self) -> bool:
        """Setup the audio capture system (to be implemented by subclasses)"""
        raise NotImplementedError("Subclasses must implement setup()")
    
    def get_devices(self) -> List[AudioDevice]:
        """Get available audio devices (to be implemented by subclasses)"""
        raise NotImplementedError("Subclasses must implement get_devices()")
    
    def start_recording(self, device_id: str = None) -> bool:
        """Start recording audio (to be implemented by subclasses)"""
        raise NotImplementedError("Subclasses must implement start_recording()")
    
    def stop_recording(self) -> bool:
        """Stop recording audio (to be implemented by subclasses)"""
        raise NotImplementedError("Subclasses must implement stop_recording()")
    
    def get_audio_chunk(self) -> Optional[bytes]:
        """Get the next chunk of audio data"""
        with self._audio_buffer_lock:
            if not self._audio_buffer:
                return None
            return self._audio_buffer.pop(0)
    
    def get_audio_stream(self) -> Generator[bytes, None, None]:
        """Generator yielding audio chunks"""
        while self._recording:
            chunk = self.get_audio_chunk()
            if chunk:
                yield chunk
            else:
                time.sleep(0.01)  # Small sleep to prevent CPU spinning
    
    def save_to_file(self, filepath: str) -> bool:
        """Save recorded audio to a file (to be implemented by subclasses)"""
        raise NotImplementedError("Subclasses must implement save_to_file()")
    
    def cleanup(self) -> None:
        """Clean up resources"""
        self.stop_recording()

# Factory function to get the appropriate implementation based on OS
def get_audio_capture_system() -> SystemAudioCapture:
    """Factory function to return the appropriate audio capture implementation for the current OS"""
    if OS_TYPE == "windows":
        try:
            from .windows_audio_capture import WindowsAudioCapture
            return WindowsAudioCapture()
        except ImportError as e:
            logger.error(f"Failed to import Windows audio capture module: {e}")
            return FallbackAudioCapture()
    
    elif OS_TYPE == "darwin":
        try:
            from .macos_audio_capture import MacOSAudioCapture
            return MacOSAudioCapture()
        except ImportError as e:
            logger.error(f"Failed to import macOS audio capture module: {e}")
            return FallbackAudioCapture()
    
    elif OS_TYPE == "linux":
        try:
            from .linux_audio_capture import LinuxAudioCapture
            return LinuxAudioCapture()
        except ImportError as e:
            logger.error(f"Failed to import Linux audio capture module: {e}")
            return FallbackAudioCapture()
    
    else:
        logger.warning(f"Unsupported OS: {OS_TYPE}, using fallback audio capture")
        return FallbackAudioCapture()

# Fallback implementation for testing and when OS-specific capture fails
class FallbackAudioCapture(SystemAudioCapture):
    """Fallback audio capture implementation for testing or when OS-specific methods fail"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._mock_devices = [
            AudioDevice("default", "Default Microphone", is_input=True, is_default=True),
            AudioDevice("system", "System Audio", is_output=True, is_loopback=True)
        ]
        self._current_device = None
        self._audio_file = None
        self._setup_complete = True
        logger.warning("Using fallback audio capture - limited functionality")
    
    def setup(self) -> bool:
        """Setup the fallback audio capture"""
        try:
            import pyaudio
            self._pa = pyaudio.PyAudio()
            return True
        except ImportError:
            logger.warning("PyAudio not available for fallback capture")
            return False
    
    def get_devices(self) -> List[AudioDevice]:
        """Get mock audio devices"""
        return self._mock_devices
    
    def start_recording(self, device_id: str = None) -> bool:
        """Start mock recording"""
        if self._recording:
            return True
        
        # Find the requested device or use default
        self._current_device = next((d for d in self._mock_devices if d.id == device_id), 
                                   self._mock_devices[0])
        
        # Create a temporary file for recording
        self._temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        self._recording = True
        
        # Start recording thread that generates mock audio data
        self._recording_thread = threading.Thread(target=self._mock_recording_thread)
        self._recording_thread.daemon = True
        self._recording_thread.start()
        
        logger.info(f"Started mock recording with device: {self._current_device.name}")
        return True
    
    def _mock_recording_thread(self):
        """Generate mock audio data for testing"""
        # Generate silent audio with occasional beeps to simulate meeting audio
        try:
            bytes_per_sample = 2  # 16-bit audio
            while self._recording:
                # Generate a chunk of mock audio (silence with occasional tone)
                buffer = bytearray(self.chunk_size * bytes_per_sample * self.channels)
                
                # Every 2 seconds, add a beep tone
                if int(time.time()) % 2 == 0:
                    # Generate a simple sine wave tone
                    for i in range(self.chunk_size):
                        value = int(32767 * 0.3 * np.sin(2 * np.pi * 440 * i / self.sample_rate))
                        # Convert to bytes (little endian)
                        buffer[i*bytes_per_sample:(i+1)*bytes_per_sample] = value.to_bytes(
                            bytes_per_sample, byteorder='little', signed=True)
                
                with self._audio_buffer_lock:
                    self._audio_buffer.append(bytes(buffer))
                    # Limit buffer size to prevent memory issues
                    if len(self._audio_buffer) > (self.sample_rate // self.chunk_size) * AUDIO_BUFFER_SECONDS:
                        self._audio_buffer.pop(0)
                
                # Write to temp file
                if self._temp_file and not self._temp_file.closed:
                    self._temp_file.write(bytes(buffer))
                
                time.sleep(self.chunk_size / self.sample_rate)  # Simulate real-time recording
                
        except Exception as e:
            logger.error(f"Error in mock recording thread: {e}")
            self._recording = False
    
    def stop_recording(self) -> bool:
        """Stop mock recording"""
        if not self._recording:
            return True
        
        self._recording = False
        
        # Clean up the temp file
        if self._temp_file and not self._temp_file.closed:
            self._temp_file.flush()
            self._temp_file.close()
        
        # Wait for the recording thread to finish
        if self._recording_thread and self._recording_thread.is_alive():
            self._recording_thread.join(timeout=1.0)
        
        logger.info("Stopped mock recording")
        return True
    
    def save_to_file(self, filepath: str) -> bool:
        """Save recorded audio to a WAV file"""
        try:
            if self._temp_file and os.path.exists(self._temp_file.name):
                # Create a proper WAV file
                with wave.open(filepath, 'wb') as wf:
                    wf.setnchannels(self.channels)
                    wf.setsampwidth(2)  # 16-bit audio
                    wf.setframerate(self.sample_rate)
                    
                    # Copy data from temp file
                    with open(self._temp_file.name, 'rb') as temp:
                        wf.writeframes(temp.read())
                
                logger.info(f"Saved mock audio to {filepath}")
                return True
            else:
                logger.error("No temporary file available to save")
                return False
        except Exception as e:
            logger.error(f"Error saving mock audio to file: {e}")
            return False
    
    def cleanup(self) -> None:
        """Clean up resources"""
        self.stop_recording()
        
        # Remove the temporary file
        if hasattr(self, '_temp_file') and self._temp_file:
            try:
                if os.path.exists(self._temp_file.name):
                    os.unlink(self._temp_file.name)
            except Exception as e:
                logger.error(f"Error cleaning up temp file: {e}")

# Simple interface for checking audio system availability
def is_system_audio_available() -> bool:
    """Check if system audio capture is available on this system"""
    try:
        capture = get_audio_capture_system()
        result = capture.setup()
        capture.cleanup()
        return result
    except Exception as e:
        logger.error(f"Error checking system audio availability: {e}")
        return False

# Helper function to get available devices
def get_available_devices() -> List[Dict[str, Any]]:
    """Get all available audio devices as a list of dictionaries"""
    try:
        capture = get_audio_capture_system()
        capture.setup()
        devices = capture.get_devices()
        capture.cleanup()
        return [device.to_dict() for device in devices]
    except Exception as e:
        logger.error(f"Error getting available devices: {e}")
        return []
