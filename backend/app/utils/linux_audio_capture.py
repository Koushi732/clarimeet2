#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Linux System Audio Capture Module for Clariimeet

Implements PulseAudio loopback for Linux systems to capture system audio output.
Requires PulseAudio to be installed and configured for loopback.
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
    logging.warning("PyAudio not available - Linux audio capture will be limited")

from .system_audio_capture import SystemAudioCapture, AudioDevice, DEFAULT_SAMPLE_RATE, DEFAULT_CHANNELS, DEFAULT_FORMAT, DEFAULT_CHUNK_SIZE

# Setup logging
logger = logging.getLogger(__name__)

# PulseAudio loopback module name
PA_LOOPBACK_MODULE = "module-loopback"

# Helper commands for PulseAudio setup and device info
PA_COMMANDS = {
    "check_pulseaudio": "pulseaudio --check",
    "list_modules": "pactl list modules | grep -i loopback",
    "list_sources": "pactl list sources | grep -e 'Name:' -e 'Description:'",
    "list_sinks": "pactl list sinks | grep -e 'Name:' -e 'Description:'",
    "load_loopback": "pactl load-module module-loopback latency_msec=1",
    "unload_loopback": "pactl unload-module module-loopback",
    "set_default_source": "pactl set-default-source {source}",
    "set_default_sink": "pactl set-default-sink {sink}"
}

class LinuxAudioCapture(SystemAudioCapture):
    """
    Linux-specific implementation of system audio capture using PulseAudio loopback.
    
    This class uses PulseAudio with module-loopback to capture system audio output.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pa = None
        self._stream = None
        self._temp_file = None
        self._recording_thread = None
        self._loopback_loaded = False
        self._loopback_module_id = None
        self._pulseaudio_sources = []
        self._pulseaudio_sinks = []
        
    def setup(self) -> bool:
        """
        Initialize PyAudio and check/setup PulseAudio loopback.
        
        Returns:
            bool: True if setup was successful, False otherwise
        """
        if not PYAUDIO_AVAILABLE:
            logger.error("PyAudio is required for Linux audio capture")
            return False
            
        try:
            # Check if PulseAudio is running
            try:
                result = subprocess.run(
                    PA_COMMANDS["check_pulseaudio"], 
                    shell=True, 
                    capture_output=True, 
                    text=True
                )
                if result.returncode != 0:
                    logger.error("PulseAudio is not running - cannot capture system audio")
                    return False
            except Exception as e:
                logger.warning(f"Failed to check PulseAudio status: {e}")
            
            # Initialize PyAudio
            self._pa = pyaudio.PyAudio()
            
            # Check for existing loopback modules
            try:
                result = subprocess.run(
                    PA_COMMANDS["list_modules"], 
                    shell=True, 
                    capture_output=True, 
                    text=True
                )
                if PA_LOOPBACK_MODULE in result.stdout:
                    logger.info("PulseAudio loopback module already loaded")
                    self._loopback_loaded = True
            except Exception as e:
                logger.warning(f"Failed to check for loopback module: {e}")
            
            # Get available PulseAudio sources and sinks
            self._refresh_pulseaudio_devices()
            
            self._setup_complete = True
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Linux audio capture: {e}")
            if self._pa:
                self._pa.terminate()
                self._pa = None
            return False
    
    def _refresh_pulseaudio_devices(self):
        """
        Refresh the list of PulseAudio sources and sinks.
        """
        # Clear existing lists
        self._pulseaudio_sources = []
        self._pulseaudio_sinks = []
        
        # Get sources
        try:
            result = subprocess.run(
                PA_COMMANDS["list_sources"], 
                shell=True, 
                capture_output=True, 
                text=True
            )
            
            lines = result.stdout.splitlines()
            current_source = None
            current_desc = None
            
            for line in lines:
                if line.strip().startswith("Name:"):
                    if current_source and current_desc:
                        self._pulseaudio_sources.append({
                            "name": current_source,
                            "description": current_desc
                        })
                    current_source = line.strip().split("Name:")[1].strip()
                    current_desc = None
                elif line.strip().startswith("Description:"):
                    current_desc = line.strip().split("Description:")[1].strip()
            
            # Add the last one
            if current_source and current_desc:
                self._pulseaudio_sources.append({
                    "name": current_source,
                    "description": current_desc
                })
        except Exception as e:
            logger.warning(f"Failed to get PulseAudio sources: {e}")
        
        # Get sinks
        try:
            result = subprocess.run(
                PA_COMMANDS["list_sinks"], 
                shell=True, 
                capture_output=True, 
                text=True
            )
            
            lines = result.stdout.splitlines()
            current_sink = None
            current_desc = None
            
            for line in lines:
                if line.strip().startswith("Name:"):
                    if current_sink and current_desc:
                        self._pulseaudio_sinks.append({
                            "name": current_sink,
                            "description": current_desc
                        })
                    current_sink = line.strip().split("Name:")[1].strip()
                    current_desc = None
                elif line.strip().startswith("Description:"):
                    current_desc = line.strip().split("Description:")[1].strip()
            
            # Add the last one
            if current_sink and current_desc:
                self._pulseaudio_sinks.append({
                    "name": current_sink,
                    "description": current_desc
                })
        except Exception as e:
            logger.warning(f"Failed to get PulseAudio sinks: {e}")
    
    def _load_loopback_module(self) -> bool:
        """
        Load the PulseAudio loopback module if not already loaded.
        
        Returns:
            bool: True if the module is loaded (or was already loaded), False otherwise
        """
        if self._loopback_loaded:
            return True
            
        try:
            result = subprocess.run(
                PA_COMMANDS["load_loopback"], 
                shell=True, 
                capture_output=True, 
                text=True
            )
            
            if result.returncode == 0:
                try:
                    self._loopback_module_id = int(result.stdout.strip())
                except:
                    pass
                self._loopback_loaded = True
                logger.info("PulseAudio loopback module loaded successfully")
                return True
            else:
                logger.error(f"Failed to load PulseAudio loopback module: {result.stderr}")
                return False
        except Exception as e:
            logger.error(f"Error loading PulseAudio loopback module: {e}")
            return False
    
    def _unload_loopback_module(self):
        """
        Unload the PulseAudio loopback module if it was loaded by us.
        """
        if not self._loopback_loaded or self._loopback_module_id is None:
            return
            
        try:
            # Unload specific module ID if we know it
            unload_cmd = f"pactl unload-module {self._loopback_module_id}"
            subprocess.run(unload_cmd, shell=True, capture_output=True, text=True)
            self._loopback_loaded = False
            self._loopback_module_id = None
            logger.info("PulseAudio loopback module unloaded")
        except Exception as e:
            logger.warning(f"Error unloading PulseAudio loopback module: {e}")
    
    def get_devices(self) -> List[AudioDevice]:
        """
        Get a list of available audio devices, highlighting PulseAudio sources for system audio.
        
        Returns:
            List[AudioDevice]: List of audio devices
        """
        if not self._setup_complete:
            if not self.setup():
                return []
        
        devices = []
        
        try:
            # Regular PyAudio enumeration
            default_input_idx = None
            try:
                default_input_idx = self._pa.get_default_input_device_info()['index']
            except:
                pass
                
            # Enumerate PyAudio devices first
            for idx in range(self._pa.get_device_count()):
                try:
                    device_info = self._pa.get_device_info_by_index(idx)
                    device_name = device_info.get('name', f"Device {idx}")
                    
                    # Only add input devices (for microphone capture)
                    if device_info.get('maxInputChannels', 0) > 0:
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
                except Exception as e:
                    logger.warning(f"Error getting device info for device {idx}: {e}")
                    continue
            
            # Now add PulseAudio sources as potential loopback devices
            for i, source in enumerate(self._pulseaudio_sources):
                # Skip sources that are clearly input devices (microphones)
                name = source['name'].lower()
                desc = source['description'].lower()
                
                if any(x in desc for x in ['monitor', 'loopback', 'output']):
                    # This is likely a monitor/loopback source (good for system audio)
                    devices.append(AudioDevice(
                        id=f"pulse_source_{i}",
                        name=f"{source['description']} (System Audio)",
                        is_input=True,
                        is_output=False,
                        is_loopback=True,
                        is_default=False,
                        sample_rates=[DEFAULT_SAMPLE_RATE],
                        channels=[DEFAULT_CHANNELS]
                    ))
            
            # If we don't have any loopback sources, offer to load the loopback module
            if not any(d.is_loopback for d in devices):
                # Add a helper option to set up loopback
                devices.append(AudioDevice(
                    id="setup_loopback",
                    name="⚠️ Click to setup PulseAudio loopback for system audio",
                    is_input=False,
                    is_output=False,
                    is_loopback=False,
                    is_default=False
                ))
                
            return devices
            
        except Exception as e:
            logger.error(f"Failed to enumerate Linux audio devices: {e}")
            return []
    
    def start_recording(self, device_id: str = None) -> bool:
        """
        Start recording system audio using PulseAudio loopback or microphone input.
        
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
            # Special handling for the setup_loopback helper device
            if device_id == "setup_loopback":
                if self._load_loopback_module():
                    # Refresh device list to get the new loopback source
                    self._refresh_pulseaudio_devices()
                    # Look for the first loopback source
                    for i, source in enumerate(self._pulseaudio_sources):
                        if 'loopback' in source['name'].lower() or 'loopback' in source['description'].lower():
                            device_id = f"pulse_source_{i}"
                            break
                else:
                    logger.error("Failed to set up loopback - cannot start recording")
                    return False
            
            # Parse the device ID to get the actual device to use
            pa_device_idx = None
            pulse_source = None
            is_loopback = False
            
            if device_id:
                if device_id.startswith('input_'):
                    try:
                        pa_device_idx = int(device_id.split('_')[1])
                    except:
                        logger.warning(f"Invalid input device ID: {device_id}, using default device")
                elif device_id.startswith('pulse_source_'):
                    try:
                        source_idx = int(device_id.split('_')[2])
                        if 0 <= source_idx < len(self._pulseaudio_sources):
                            pulse_source = self._pulseaudio_sources[source_idx]['name']
                            is_loopback = True
                    except:
                        logger.warning(f"Invalid PulseAudio source ID: {device_id}, using default device")
            
            # If no valid device ID was provided, use the default input device
            if pa_device_idx is None and pulse_source is None:
                try:
                    # Try to find a loopback source first
                    loopback_found = False
                    for i, source in enumerate(self._pulseaudio_sources):
                        if any(x in source['description'].lower() for x in ['monitor', 'loopback', 'output']):
                            pulse_source = source['name']
                            is_loopback = True
                            loopback_found = True
                            break
                    
                    # If no loopback source, use default input
                    if not loopback_found:
                        pa_device_idx = self._pa.get_default_input_device_info()['index']
                except:
                    # Just find any input device
                    for idx in range(self._pa.get_device_count()):
                        try:
                            device_info = self._pa.get_device_info_by_index(idx)
                            if device_info.get('maxInputChannels', 0) > 0:
                                pa_device_idx = idx
                                break
                        except:
                            continue
            
            # If we still don't have a device, error out
            if pa_device_idx is None and pulse_source is None:
                logger.error("No suitable audio device found for recording")
                return False
            
            # Create a temporary file for recording
            self._temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            
            # If using PulseAudio source directly
            if pulse_source:
                try:
                    # Set the source as default if it's not already
                    set_source_cmd = PA_COMMANDS["set_default_source"].format(source=pulse_source)
                    subprocess.run(set_source_cmd, shell=True, capture_output=True, text=True)
                    
                    # Use default device with PyAudio (which will use the PulseAudio default)
                    stream_params = {
                        'format': pyaudio.paInt16,
                        'channels': self.channels,
                        'rate': self.sample_rate,
                        'input': True,
                        'frames_per_buffer': self.chunk_size
                    }
                except Exception as e:
                    logger.warning(f"Error setting PulseAudio source: {e}, falling back to default device")
                    # Fall back to default device
                    stream_params = {
                        'format': pyaudio.paInt16,
                        'channels': self.channels,
                        'rate': self.sample_rate,
                        'input': True,
                        'frames_per_buffer': self.chunk_size
                    }
            else:
                # Using specific PyAudio device
                try:
                    device_info = self._pa.get_device_info_by_index(pa_device_idx)
                    stream_params = {
                        'format': pyaudio.paInt16,
                        'channels': min(2, device_info.get('maxInputChannels', 1)),
                        'rate': int(device_info.get('defaultSampleRate', self.sample_rate)),
                        'input': True,
                        'frames_per_buffer': self.chunk_size,
                        'input_device_index': pa_device_idx
                    }
                    
                    # Update our parameters to match the device
                    self.sample_rate = stream_params['rate']
                    self.channels = stream_params['channels']
                except Exception as e:
                    logger.error(f"Error getting device info: {e}")
                    return False
            
            # Open the stream
            self._stream = self._pa.open(**stream_params)
            self._recording = True
            
            # Start the recording thread
            self._recording_thread = threading.Thread(target=self._recording_worker)
            self._recording_thread.daemon = True
            self._recording_thread.start()
            
            logger.info(f"Started Linux audio capture from {'system audio' if is_loopback else 'microphone'}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start Linux audio capture: {e}")
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
            logger.error(f"Error in Linux audio recording worker: {e}")
        finally:
            logger.info("Linux audio recording worker stopped")
    
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
            
            logger.info("Stopped Linux audio capture")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping Linux audio capture: {e}")
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
            
            logger.info(f"Saved Linux audio capture to {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving Linux audio capture to file: {e}")
            return False
    
    def cleanup(self) -> None:
        """
        Clean up resources used by the audio capture system.
        """
        self.stop_recording()
        
        # Unload loopback module if we loaded it
        if self._loopback_loaded and self._loopback_module_id is not None:
            self._unload_loopback_module()
        
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
        logger.info("Linux audio capture resources cleaned up")

# Helper function to generate PulseAudio loopback setup instructions
def get_pulseaudio_setup_instructions() -> str:
    """
    Generate instructions for setting up PulseAudio loopback on Linux.
    
    Returns:
        str: Setup instructions in markdown format
    """
    return """
## Linux System Audio Capture Setup Instructions

To capture system audio on Linux, you need to set up PulseAudio loopback:

### 1. Install PulseAudio (if not already installed)

```bash
# Ubuntu/Debian
sudo apt-get install pulseaudio pulseaudio-utils

# Fedora
sudo dnf install pulseaudio pulseaudio-utils

# Arch Linux
sudo pacman -S pulseaudio pulseaudio-utils
```

### 2. Load the loopback module

This will route your system audio to a recording source:

```bash
pactl load-module module-loopback latency_msec=1
```

To make this permanent, add to `/etc/pulse/default.pa`:

```
### Enable loopback device for system audio capture
load-module module-loopback latency_msec=1
```

### 3. In Clariimeet

1. Select the monitor or loopback source from the device list
2. Start recording to capture system audio

### Alternative: Using PulseAudio Volume Control

Install pavucontrol for a graphical interface to manage audio routing:

```bash
# Ubuntu/Debian
sudo apt-get install pavucontrol

# Fedora
sudo dnf install pavucontrol

# Arch Linux
sudo pacman -S pavucontrol
```

Then use the Recording tab to select what sources applications record from.
"""
