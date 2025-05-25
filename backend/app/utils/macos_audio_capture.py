#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
macOS System Audio Capture Module for Clariimeet

Implements BlackHole/Soundflower integration for macOS systems to capture system audio output.
Requires BlackHole or Soundflower virtual audio device to be installed.
"""

import os
import sys
import time
import wave
import shutil
import tempfile
import logging
import threading
import subprocess
import numpy as np
from typing import Dict, List, Optional, Tuple, Union, BinaryIO
from pathlib import Path

try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    logging.warning("PyAudio not available - macOS audio capture will be limited")

from .system_audio_capture import SystemAudioCapture, AudioDevice, DEFAULT_SAMPLE_RATE, DEFAULT_CHANNELS, DEFAULT_FORMAT, DEFAULT_CHUNK_SIZE

# Setup logging
logger = logging.getLogger(__name__)

# BlackHole/Soundflower device names to look for
VIRTUAL_DEVICE_NAMES = [
    "BlackHole",
    "BlackHole 2ch", 
    "BlackHole 16ch",
    "Soundflower",
    "Soundflower (2ch)",
    "Soundflower (64ch)"
]

# Helper utilities for setup checks and device configuration
DEVICE_SETUP_COMMANDS = {
    "check_blackhole": "system_profiler SPAudioDataType | grep -i blackhole",
    "check_soundflower": "system_profiler SPAudioDataType | grep -i soundflower",
    "list_audio_devices": "system_profiler SPAudioDataType"
}

class MacOSAudioCapture(SystemAudioCapture):
    """
    macOS-specific implementation of system audio capture using BlackHole/Soundflower.
    
    This class uses PyAudio with BlackHole/Soundflower virtual audio device to capture system audio.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pa = None
        self._stream = None
        self._temp_file = None
        self._virtual_device_info = None
        self._recording_thread = None
        self._is_virtual_audio_setup = False
        
    def setup(self) -> bool:
        """
        Initialize PyAudio and check for BlackHole/Soundflower virtual audio device.
        
        Returns:
            bool: True if setup was successful, False otherwise
        """
        if not PYAUDIO_AVAILABLE:
            logger.error("PyAudio is required for macOS audio capture")
            return False
            
        try:
            self._pa = pyaudio.PyAudio()
            
            # Check if BlackHole/Soundflower is installed
            virtual_device_found = False
            for idx in range(self._pa.get_device_count()):
                try:
                    device_info = self._pa.get_device_info_by_index(idx)
                    device_name = device_info.get('name', '')
                    
                    # Check if this is a virtual audio device
                    if any(vdn.lower() in device_name.lower() for vdn in VIRTUAL_DEVICE_NAMES):
                        self._virtual_device_info = device_info
                        virtual_device_found = True
                        logger.info(f"Found virtual audio device: {device_name}")
                        break
                except Exception as e:
                    logger.warning(f"Error checking device {idx}: {e}")
            
            if not virtual_device_found:
                logger.warning("BlackHole/Soundflower virtual audio device not found!")
                logger.warning("System audio capture will not be available without BlackHole or Soundflower.")
                logger.warning("Please install BlackHole: https://github.com/ExistentialAudio/BlackHole")
                
                # Try to check using system_profiler as a fallback
                try:
                    check_cmd = DEVICE_SETUP_COMMANDS["check_blackhole"]
                    result = subprocess.run(check_cmd, shell=True, capture_output=True, text=True)
                    if result.stdout.strip():
                        logger.info("BlackHole detected via system_profiler but not through PyAudio")
                        logger.info("Audio routing may need to be configured in System Preferences")
                except Exception as e:
                    logger.warning(f"Failed to run system check: {e}")
            else:
                self._is_virtual_audio_setup = True
                
            self._setup_complete = True
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize macOS audio capture: {e}")
            if self._pa:
                self._pa.terminate()
                self._pa = None
            return False
    
    def get_devices(self) -> List[AudioDevice]:
        """
        Get a list of available audio devices, highlighting BlackHole/Soundflower devices for system audio.
        
        Returns:
            List[AudioDevice]: List of audio devices
        """
        if not self._setup_complete:
            if not self.setup():
                return []
        
        devices = []
        default_input_idx = None
        default_output_idx = None
        
        try:
            # Find default devices
            try:
                default_input_idx = self._pa.get_default_input_device_info()['index']
            except:
                pass
                
            try:
                default_output_idx = self._pa.get_default_output_device_info()['index']
            except:
                pass
                
            # Enumerate all devices
            for idx in range(self._pa.get_device_count()):
                try:
                    device_info = self._pa.get_device_info_by_index(idx)
                    device_name = device_info.get('name', f"Device {idx}")
                    
                    # Determine if this is a virtual audio device
                    is_virtual = any(vdn.lower() in device_name.lower() for vdn in VIRTUAL_DEVICE_NAMES)
                    
                    # Determine if this is an input or output device
                    is_input = device_info.get('maxInputChannels', 0) > 0
                    is_output = device_info.get('maxOutputChannels', 0) > 0
                    
                    # Regular input devices (microphones)
                    if is_input and not is_virtual:
                        devices.append(AudioDevice(
                            id=f"input_{idx}",
                            name=f"{device_name} (Microphone)",
                            is_input=True,
                            is_output=False,
                            is_loopback=False,
                            is_default=(idx == default_input_idx),
                            sample_rates=[int(device_info.get('defaultSampleRate', DEFAULT_SAMPLE_RATE))],
                            channels=[min(int(device_info.get('maxInputChannels', DEFAULT_CHANNELS)), 2)]
                        ))
                    
                    # Virtual audio devices (for system audio)
                    if is_input and is_virtual:
                        devices.append(AudioDevice(
                            id=f"virtual_{idx}",
                            name=f"{device_name} (System Audio)",
                            is_input=True,
                            is_output=False,
                            is_loopback=True,  # This is effectively loopback
                            is_default=False,  # Never default
                            sample_rates=[int(device_info.get('defaultSampleRate', DEFAULT_SAMPLE_RATE))],
                            channels=[min(int(device_info.get('maxInputChannels', DEFAULT_CHANNELS)), 2)]
                        ))
                        
                    # Regular output devices (for reference)
                    if is_output and not is_virtual:
                        devices.append(AudioDevice(
                            id=f"output_{idx}",
                            name=f"{device_name} (Output)",
                            is_input=False,
                            is_output=True,
                            is_loopback=False,
                            is_default=(idx == default_output_idx),
                            sample_rates=[int(device_info.get('defaultSampleRate', DEFAULT_SAMPLE_RATE))],
                            channels=[min(int(device_info.get('maxOutputChannels', DEFAULT_CHANNELS)), 2)]
                        ))
                        
                except Exception as e:
                    logger.warning(f"Error getting device info for device {idx}: {e}")
                    continue
            
            # If we found BlackHole/Soundflower, add a helper note
            if self._is_virtual_audio_setup:
                devices.append(AudioDevice(
                    id="setup_help",
                    name="⚠️ Configure macOS audio routing in System Preferences",
                    is_input=False,
                    is_output=False,
                    is_loopback=False,
                    is_default=False
                ))
            else:
                # No virtual audio device found, add a helper note
                devices.append(AudioDevice(
                    id="install_help",
                    name="⚠️ Install BlackHole for system audio capture",
                    is_input=False,
                    is_output=False,
                    is_loopback=False,
                    is_default=False
                ))
                
            return devices
            
        except Exception as e:
            logger.error(f"Failed to enumerate macOS audio devices: {e}")
            return []
    
    def _check_virtual_device_setup(self) -> bool:
        """
        Check if a virtual audio device is properly set up.
        
        Returns:
            bool: True if a virtual audio device is available, False otherwise
        """
        if self._virtual_device_info is not None:
            return True
            
        # Recheck devices to see if BlackHole/Soundflower is available
        for idx in range(self._pa.get_device_count()):
            try:
                device_info = self._pa.get_device_info_by_index(idx)
                device_name = device_info.get('name', '')
                
                if any(vdn.lower() in device_name.lower() for vdn in VIRTUAL_DEVICE_NAMES):
                    self._virtual_device_info = device_info
                    self._is_virtual_audio_setup = True
                    return True
            except:
                continue
                
        return False
    
    def start_recording(self, device_id: str = None) -> bool:
        """
        Start recording system audio using BlackHole/Soundflower.
        
        Args:
            device_id (str, optional): ID of the device to record from. Defaults to None (use default device).
        
        Returns:
            bool: True if recording started successfully, False otherwise
        """
        if self._recording:
            return True
        
        if not self._setup_complete:
            if not self.setup():
                return False
        
        try:
            # Parse the device ID to get the actual PyAudio device index
            pa_device_idx = None
            is_virtual = False
            
            if device_id:
                if device_id.startswith('virtual_'):
                    try:
                        pa_device_idx = int(device_id.split('_')[1])
                        is_virtual = True
                    except:
                        logger.warning(f"Invalid virtual device ID: {device_id}, using default device")
                elif device_id.startswith('input_'):
                    try:
                        pa_device_idx = int(device_id.split('_')[1])
                        is_virtual = False
                    except:
                        logger.warning(f"Invalid input device ID: {device_id}, using default device")
            
            # If no valid device ID was provided, try to use a virtual audio device if available
            if pa_device_idx is None:
                if self._check_virtual_device_setup():
                    # Use the virtual device that we found during setup
                    for idx in range(self._pa.get_device_count()):
                        try:
                            device_info = self._pa.get_device_info_by_index(idx)
                            device_name = device_info.get('name', '')
                            
                            if any(vdn.lower() in device_name.lower() for vdn in VIRTUAL_DEVICE_NAMES):
                                pa_device_idx = idx
                                is_virtual = True
                                break
                        except:
                            continue
                else:
                    # If no virtual device, use the default input device (microphone)
                    try:
                        pa_device_idx = self._pa.get_default_input_device_info()['index']
                        is_virtual = False
                    except:
                        # Just find any input device
                        for idx in range(self._pa.get_device_count()):
                            try:
                                device_info = self._pa.get_device_info_by_index(idx)
                                if device_info.get('maxInputChannels', 0) > 0:
                                    pa_device_idx = idx
                                    is_virtual = False
                                    break
                            except:
                                continue
            
            if pa_device_idx is None:
                logger.error("No suitable audio device found for recording")
                return False
            
            # Get the device info
            try:
                device_info = self._pa.get_device_info_by_index(pa_device_idx)
            except Exception as e:
                logger.error(f"Error getting device info: {e}")
                return False
            
            # Create a temporary file for recording
            self._temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            
            # Setup the audio stream
            stream_params = {
                'format': pyaudio.paInt16,
                'channels': min(2, device_info.get('maxInputChannels', 1)),
                'rate': int(device_info.get('defaultSampleRate', self.sample_rate)),
                'input': True,
                'frames_per_buffer': self.chunk_size,
                'input_device_index': pa_device_idx
            }
            
            # Update our sample rate to match the device's native rate
            self.sample_rate = int(device_info.get('defaultSampleRate', self.sample_rate))
            self.channels = stream_params['channels']
            
            # Open the stream
            self._stream = self._pa.open(**stream_params)
            self._recording = True
            
            # Start the recording thread
            self._recording_thread = threading.Thread(target=self._recording_worker)
            self._recording_thread.daemon = True
            self._recording_thread.start()
            
            logger.info(f"Started macOS audio capture from {'system audio' if is_virtual else 'microphone'}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start macOS audio capture: {e}")
            self.cleanup()
            return False
    
    def _recording_worker(self):
        """
        Worker thread that reads audio data from the stream and processes it.
        """
        try:
            while self._recording and self._stream and self._stream.is_active():
                try:
                    # Read audio data from the stream
                    audio_data = self._stream.read(self.chunk_size, exception_on_overflow=False)
                    
                    # Add to buffer for real-time processing
                    with self._audio_buffer_lock:
                        self._audio_buffer.append(audio_data)
                        # Limit buffer size
                        max_buffer_chunks = (self.sample_rate // self.chunk_size) * 30  # 30 seconds
                        if len(self._audio_buffer) > max_buffer_chunks:
                            self._audio_buffer.pop(0)
                    
                    # Write to temporary file
                    if self._temp_file and not self._temp_file.closed:
                        self._temp_file.write(audio_data)
                        
                except IOError as e:
                    # This can happen when the stream is overflowed - just continue
                    logger.warning(f"Audio stream overflow: {e}")
                    continue
                    
                except Exception as e:
                    logger.error(f"Error reading audio data: {e}")
                    break
                    
        except Exception as e:
            logger.error(f"Error in macOS audio recording worker: {e}")
        finally:
            logger.info("macOS audio recording worker stopped")
    
    def stop_recording(self) -> bool:
        """
        Stop recording audio.
        
        Returns:
            bool: True if recording stopped successfully, False otherwise
        """
        if not self._recording:
            return True
        
        try:
            self._recording = False
            
            # Stop and close the audio stream
            if self._stream:
                try:
                    self._stream.stop_stream()
                    self._stream.close()
                except Exception as e:
                    logger.warning(f"Error closing audio stream: {e}")
                self._stream = None
            
            # Flush and close the temporary file
            if self._temp_file and not self._temp_file.closed:
                self._temp_file.flush()
                self._temp_file.close()
            
            # Wait for the recording thread to finish
            if self._recording_thread and self._recording_thread.is_alive():
                self._recording_thread.join(timeout=2.0)
            
            logger.info("Stopped macOS audio capture")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping macOS audio capture: {e}")
            return False
    
    def save_to_file(self, filepath: str) -> bool:
        """
        Save the recorded audio to a WAV file.
        
        Args:
            filepath (str): Path to save the WAV file to
        
        Returns:
            bool: True if file was saved successfully, False otherwise
        """
        try:
            if not self._temp_file or not os.path.exists(self._temp_file.name):
                logger.error("No recorded audio available to save")
                return False
            
            # Create a proper WAV file with headers
            with wave.open(filepath, 'wb') as wf:
                wf.setnchannels(self.channels)
                wf.setsampwidth(2)  # 16-bit audio = 2 bytes
                wf.setframerate(self.sample_rate)
                
                # Copy the audio data from the temporary file
                with open(self._temp_file.name, 'rb') as temp_file:
                    wf.writeframes(temp_file.read())
            
            logger.info(f"Saved macOS audio capture to {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving macOS audio capture to file: {e}")
            return False
    
    def cleanup(self) -> None:
        """
        Clean up resources used by the audio capture system.
        """
        self.stop_recording()
        
        # Clean up PyAudio
        if self._pa:
            try:
                self._pa.terminate()
            except:
                pass
            self._pa = None
        
        # Remove the temporary file
        if hasattr(self, '_temp_file') and self._temp_file:
            try:
                if os.path.exists(self._temp_file.name):
                    os.unlink(self._temp_file.name)
            except Exception as e:
                logger.warning(f"Error removing temporary file: {e}")
        
        self._setup_complete = False
        logger.info("macOS audio capture resources cleaned up")

# Helper function to generate BlackHole/Soundflower setup instructions
def get_virtual_audio_setup_instructions() -> str:
    """
    Generate instructions for setting up BlackHole/Soundflower on macOS.
    
    Returns:
        str: Setup instructions in markdown format
    """
    return """
## macOS System Audio Capture Setup Instructions

To capture system audio on macOS, you need to install and configure a virtual audio device:

### 1. Install BlackHole (recommended)

1. Install BlackHole using Homebrew:
   ```
   brew install blackhole-2ch
   ```
   
   Or download from: https://github.com/ExistentialAudio/BlackHole

### 2. Configure Audio Routing

1. Open 'Audio MIDI Setup' from Applications > Utilities
2. Click the '+' in the bottom left corner and select 'Create Multi-Output Device'
3. Check both your regular output device and 'BlackHole 2ch'
4. Set your Multi-Output Device as the default output in System Preferences > Sound

### 3. In Clariimeet

1. Select 'BlackHole 2ch (System Audio)' as your input device
2. Start recording to capture both system audio and your microphone

### Alternative: Using Soundflower

If BlackHole doesn't work, you can try Soundflower instead:
- Download from: https://github.com/mattingalls/Soundflower
- Follow similar setup steps using 'Soundflower (2ch)' instead of BlackHole
"""
