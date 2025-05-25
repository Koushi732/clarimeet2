#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Windows System Audio Capture Module for Clariimeet

Implements WASAPI loopback capture for Windows systems to record system audio output.
Requires PyAudio with WASAPI support.
"""

import os
import sys
import time
import wave
import tempfile
import logging
import threading
import numpy as np
from typing import Dict, List, Optional, Tuple, Union, BinaryIO

try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    logging.warning("PyAudio not available - Windows audio capture will be limited")

from .system_audio_capture import SystemAudioCapture, AudioDevice, DEFAULT_SAMPLE_RATE, DEFAULT_CHANNELS, DEFAULT_FORMAT, DEFAULT_CHUNK_SIZE

# Setup logging
logger = logging.getLogger(__name__)

# WASAPI constants
WASAPI_EXCLUSIVE_MODE = False  # Set to True for exclusive mode (lower latency but blocks other apps)
MAX_DEVICE_SEARCH_ATTEMPTS = 3  # Number of times to retry finding loopback devices
DEVICE_SEARCH_RETRY_DELAY = 0.5  # Delay in seconds between retries

class WindowsAudioCapture(SystemAudioCapture):
    """
    Windows-specific implementation of system audio capture using WASAPI loopback.
    
    This class uses PyAudio with WASAPI to capture system audio from output devices.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pa = None
        self._stream = None
        self._temp_file = None
        self._wasapi_devices = []
        self._current_device_info = None
        self._recording_thread = None
        
    def setup(self) -> bool:
        """
        Initialize PyAudio and prepare for WASAPI loopback capture.
        
        Returns:
            bool: True if setup was successful, False otherwise
        """
        if not PYAUDIO_AVAILABLE:
            logger.error("PyAudio is required for Windows audio capture")
            return False
            
        try:
            self._pa = pyaudio.PyAudio()
            # Check if WASAPI loopback is available
            loopback_device_found = False
            for i in range(MAX_DEVICE_SEARCH_ATTEMPTS):
                try:
                    for idx in range(self._pa.get_device_count()):
                        device_info = self._pa.get_device_info_by_index(idx)
                        # Look for WASAPI supported output devices
                        # Windows 10+ should have WASAPI loopback support
                        if device_info.get('maxInputChannels') > 0 or device_info.get('hostApi') == 0:  # hostApi 0 is usually MME
                            loopback_device_found = True
                            break
                except Exception as e:
                    logger.warning(f"Error in device enumeration attempt {i+1}: {e}")
                    time.sleep(DEVICE_SEARCH_RETRY_DELAY)
                    continue
                    
                if loopback_device_found:
                    break
            
            if not loopback_device_found:
                logger.warning("No WASAPI loopback devices found - system audio capture may be limited")
                
            self._setup_complete = True
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Windows audio capture: {e}")
            if self._pa:
                self._pa.terminate()
                self._pa = None
            return False
    
    def get_devices(self) -> List[AudioDevice]:
        """
        Get a list of available audio devices with WASAPI loopback support.
        
        Returns:
            List[AudioDevice]: List of audio devices
        """
        if not self._setup_complete:
            if not self.setup():
                return []
        
        devices = []
        default_device_index = None
        
        try:
            # Find default output device
            try:
                default_device_index = self._pa.get_default_output_device_info()['index']
            except:
                # If can't get default device, use the first available output device
                pass
                
            # Enumerate all devices
            for idx in range(self._pa.get_device_count()):
                try:
                    device_info = self._pa.get_device_info_by_index(idx)
                    
                    # Determine if this is an input or output device
                    is_input = device_info.get('maxInputChannels', 0) > 0
                    is_output = device_info.get('maxOutputChannels', 0) > 0
                    
                    # Create an AudioDevice for each output device (for loopback)
                    if is_output:
                        device_name = device_info.get('name', f"Device {idx}")
                        
                        # If it's also an input device, we can use it for regular mic capture too
                        if is_input:
                            devices.append(AudioDevice(
                                id=f"input_{idx}",
                                name=f"{device_name} (Microphone)",
                                is_input=True,
                                is_output=False,
                                is_loopback=False,
                                is_default=(idx == default_device_index),
                                sample_rates=[int(device_info.get('defaultSampleRate', DEFAULT_SAMPLE_RATE))],
                                channels=[min(int(device_info.get('maxInputChannels', DEFAULT_CHANNELS)), 2)]
                            ))
                        
                        # Always add the loopback version for system audio capture
                        devices.append(AudioDevice(
                            id=f"loopback_{idx}",
                            name=f"{device_name} (System Audio)",
                            is_input=False,
                            is_output=True,
                            is_loopback=True,
                            is_default=(idx == default_device_index),
                            sample_rates=[int(device_info.get('defaultSampleRate', DEFAULT_SAMPLE_RATE))],
                            channels=[min(int(device_info.get('maxOutputChannels', DEFAULT_CHANNELS)), 2)]
                        ))
                        
                        # Store the raw device info for later use
                        self._wasapi_devices.append({
                            'id': idx,
                            'info': device_info,
                            'is_input': is_input,
                            'is_output': is_output,
                            'is_default': (idx == default_device_index)
                        })
                except Exception as e:
                    logger.warning(f"Error getting device info for device {idx}: {e}")
                    continue
                    
            return devices
        except Exception as e:
            logger.error(f"Failed to enumerate Windows audio devices: {e}")
            return []
    
    def start_recording(self, device_id: str = None) -> bool:
        """
        Start recording system audio using WASAPI loopback.
        
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
            is_loopback = False
            
            if device_id:
                if device_id.startswith('loopback_'):
                    try:
                        pa_device_idx = int(device_id.split('_')[1])
                        is_loopback = True
                    except:
                        logger.warning(f"Invalid loopback device ID: {device_id}, using default device")
                elif device_id.startswith('input_'):
                    try:
                        pa_device_idx = int(device_id.split('_')[1])
                        is_loopback = False
                    except:
                        logger.warning(f"Invalid input device ID: {device_id}, using default device")
            
            # If no valid device ID was provided, use the default output device for loopback
            if pa_device_idx is None:
                try:
                    pa_device_idx = self._pa.get_default_output_device_info()['index']
                    is_loopback = True
                except:
                    # If we can't get the default device, find the first available output device
                    for dev in self._wasapi_devices:
                        if dev['is_output']:
                            pa_device_idx = dev['id']
                            is_loopback = True
                            break
            
            if pa_device_idx is None:
                logger.error("No suitable audio device found for recording")
                return False
            
            # Get the device info
            try:
                device_info = self._pa.get_device_info_by_index(pa_device_idx)
                self._current_device_info = device_info
            except Exception as e:
                logger.error(f"Error getting device info: {e}")
                return False
            
            # Create a temporary file for recording
            self._temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            
            # Setup the audio stream
            if is_loopback:
                # WASAPI loopback for system audio
                stream_params = {
                    'format': pyaudio.paInt16,
                    'channels': min(2, device_info.get('maxOutputChannels', 2)),  # Use stereo if available
                    'rate': int(device_info.get('defaultSampleRate', self.sample_rate)),
                    'input': True,
                    'frames_per_buffer': self.chunk_size,
                    'input_device_index': pa_device_idx,
                    'as_loopback': True  # This is the key for WASAPI loopback
                }
            else:
                # Regular input device (microphone)
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
            
            logger.info(f"Started Windows audio capture from {'system audio' if is_loopback else 'microphone'}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start Windows audio capture: {e}")
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
            logger.error(f"Error in Windows audio recording worker: {e}")
        finally:
            logger.info("Windows audio recording worker stopped")
    
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
            
            logger.info("Stopped Windows audio capture")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping Windows audio capture: {e}")
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
            
            logger.info(f"Saved Windows audio capture to {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving Windows audio capture to file: {e}")
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
        logger.info("Windows audio capture resources cleaned up")
