import pyaudio
import wave
import threading
import time
import os
import logging
import platform
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
import queue
import tempfile
import uuid
import shutil

try:
    import sounddevice as sd
    import soundfile as sf
    from pydub import AudioSegment
except ImportError:
    logging.warning("Some audio libraries could not be imported. Limited functionality available.")
    
# Platform-specific imports
if platform.system() == "Windows":
    try:
        import win32api
        import win32gui
        import win32process
    except ImportError:
        logging.warning("Windows-specific libraries could not be imported. System audio capture may not work.")

# Platform-specific imports
if platform.system() == "Windows":
    import win32api
    import win32gui
    import win32process
    import comtypes
    from comtypes import CLSCTX_ALL
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume, IMMDeviceEnumerator, MMDeviceEnumerator, EDataFlow

# Constants
CHUNK = 1024
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000  # 16kHz is often used for speech recognition

# Logging
logger = logging.getLogger(__name__)

# Active recordings
active_recordings = {}
recording_status = {}

def get_audio_devices() -> List[Dict[str, Any]]:
    """Get a list of available audio devices."""
    try:
        devices = []
        p = pyaudio.PyAudio()
        
        # Get input devices
        for i in range(p.get_device_count()):
            device_info = p.get_device_info_by_index(i)
            
            # Create a device entry
            device = {
                "id": str(i),
                "name": device_info["name"],
                "is_input": device_info["maxInputChannels"] > 0,
                "is_default": device_info["defaultSampleRate"] > 0,
                "is_loopback": False
            }
            
            devices.append(device)
        
        # On Windows, add loopback devices for system audio
        if platform.system() == "Windows":
            try:
                # Simple approach - add a virtual loopback device
                # In a real app, we'd detect actual loopback capabilities
                device_id = "loopback_0"
                devices.append({
                    "id": device_id,
                    "name": "System Audio (Windows)",
                    "is_input": False,
                    "is_default": False,
                    "is_loopback": True
                })
            except Exception as e:
                logger.error(f"Error setting up Windows loopback devices: {e}")
        
        p.terminate()
        return devices
    
    except Exception as e:
        logger.error(f"Error getting audio devices: {e}")
        return [
            # Return fallback devices if hardware detection fails
            {
                "id": "default",
                "name": "Default Microphone",
                "is_input": True,
                "is_default": True,
                "is_loopback": False
            }
        ]

def _record_audio(device_id: str, output_path: str, session_id: str, loopback: bool = False):
    """Internal function to record audio from a device."""
    try:
        p = pyaudio.PyAudio()
        
        # Set up parameters
        if loopback and platform.system() == "Windows":
            # For Windows loopback capture
            device_index = int(device_id.replace("loopback_", ""))
            
            # Set up a wave file to store the audio
            wf = wave.open(output_path, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(p.get_sample_size(FORMAT))
            wf.setframerate(RATE)
            
            # Get sessions for the device
            sessions = AudioUtilities.GetAllSessions()
            
            # Create a buffer
            audio_buffer = queue.Queue()
            
            # Flag to control recording
            recording_status[session_id] = {
                "is_recording": True,
                "start_time": time.time(),
                "duration": 0,
                "level": 0.0
            }
            
            # Define callback function
            def callback(in_data, frame_count, time_info, status):
                if recording_status[session_id]["is_recording"]:
                    # Convert bytes to numpy array
                    audio_data = np.frombuffer(in_data, dtype=np.int16)
                    
                    # Calculate audio level (RMS)
                    if len(audio_data) > 0:
                        rms = np.sqrt(np.mean(np.square(audio_data.astype(np.float32))))
                        recording_status[session_id]["level"] = float(rms) / 32767.0  # Normalize to 0-1
                    
                    # Write to file
                    wf.writeframes(in_data)
                    
                    # Update duration
                    recording_status[session_id]["duration"] = time.time() - recording_status[session_id]["start_time"]
                    
                    return (in_data, pyaudio.paContinue)
                else:
                    return (None, pyaudio.paComplete)
            
            # Open stream
            stream = p.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=RATE,
                input=True,
                frames_per_buffer=CHUNK,
                input_device_index=device_index,
                stream_callback=callback
            )
            
            # Start stream
            stream.start_stream()
            
            # Store active recording
            active_recordings[session_id] = {
                "stream": stream,
                "p": p,
                "wf": wf
            }
            
            # Keep recording until stopped
            while stream.is_active() and recording_status[session_id]["is_recording"]:
                time.sleep(0.1)
            
            # Clean up
            if not recording_status[session_id]["is_recording"]:
                stream.stop_stream()
                stream.close()
                wf.close()
                p.terminate()
                
                # Remove from active recordings
                del active_recordings[session_id]
                
                # Return success
                return True
        
        else:
            # For regular audio input
            device_index = int(device_id)
            
            # Set up a wave file to store the audio
            wf = wave.open(output_path, 'wb')
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(p.get_sample_size(FORMAT))
            wf.setframerate(RATE)
            
            # Flag to control recording
            recording_status[session_id] = {
                "is_recording": True,
                "start_time": time.time(),
                "duration": 0,
                "level": 0.0
            }
            
            # Define callback function
            def callback(in_data, frame_count, time_info, status):
                if recording_status[session_id]["is_recording"]:
                    # Convert bytes to numpy array
                    audio_data = np.frombuffer(in_data, dtype=np.int16)
                    
                    # Calculate audio level (RMS)
                    if len(audio_data) > 0:
                        rms = np.sqrt(np.mean(np.square(audio_data.astype(np.float32))))
                        recording_status[session_id]["level"] = float(rms) / 32767.0  # Normalize to 0-1
                    
                    # Write to file
                    wf.writeframes(in_data)
                    
                    # Update duration
                    recording_status[session_id]["duration"] = time.time() - recording_status[session_id]["start_time"]
                    
                    return (in_data, pyaudio.paContinue)
                else:
                    return (None, pyaudio.paComplete)
            
            # Open stream
            stream = p.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=RATE,
                input=True,
                frames_per_buffer=CHUNK,
                input_device_index=device_index,
                stream_callback=callback
            )
            
            # Start stream
            stream.start_stream()
            
            # Store active recording
            active_recordings[session_id] = {
                "stream": stream,
                "p": p,
                "wf": wf
            }
            
            # Keep recording until stopped
            while stream.is_active() and recording_status[session_id]["is_recording"]:
                time.sleep(0.1)
            
            # Clean up
            if not recording_status[session_id]["is_recording"]:
                stream.stop_stream()
                stream.close()
                wf.close()
                p.terminate()
                
                # Remove from active recordings
                del active_recordings[session_id]
                
                # Return success
                return True
    
    except Exception as e:
        logger.error(f"Error recording audio: {e}")
        
        # Clean up
        if session_id in recording_status:
            recording_status[session_id]["is_recording"] = False
        
        if session_id in active_recordings:
            try:
                active_recordings[session_id]["stream"].stop_stream()
                active_recordings[session_id]["stream"].close()
                active_recordings[session_id]["wf"].close()
                active_recordings[session_id]["p"].terminate()
            except:
                pass
            
            # Remove from active recordings
            del active_recordings[session_id]
        
        return False

def start_recording(device_id: str, output_path: str, session_id: str, loopback: bool = False) -> bool:
    """Start recording audio from a device."""
    try:
        # Check if already recording
        if session_id in active_recordings:
            logger.warning(f"Already recording for session {session_id}")
            return False
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Start recording in a separate thread
        thread = threading.Thread(
            target=_record_audio,
            args=(device_id, output_path, session_id, loopback)
        )
        thread.daemon = True
        thread.start()
        
        # Wait for recording to start
        time.sleep(0.5)
        
        # Check if recording started successfully
        if session_id in recording_status and recording_status[session_id]["is_recording"]:
            return True
        else:
            return False
    
    except Exception as e:
        logger.error(f"Error starting recording: {e}")
        return False

def stop_recording(session_id: str) -> Tuple[bool, float]:
    """Stop recording audio for a session."""
    try:
        # Check if recording
        if session_id not in active_recordings or session_id not in recording_status:
            logger.warning(f"No active recording for session {session_id}")
            return False, 0
        
        # Get current duration
        duration = recording_status[session_id]["duration"]
        
        # Set flag to stop recording
        recording_status[session_id]["is_recording"] = False
        
        # Wait for recording to stop
        time.sleep(0.5)
        
        # Check if recording stopped successfully
        if session_id not in active_recordings:
            return True, duration
        else:
            return False, duration
    
    except Exception as e:
        logger.error(f"Error stopping recording: {e}")
        return False, 0

def get_recording_status(session_id: str) -> Tuple[bool, float, float]:
    """Get recording status for a session."""
    try:
        # Check if recording
        if session_id in recording_status:
            return (
                recording_status[session_id]["is_recording"],
                recording_status[session_id]["duration"],
                recording_status[session_id]["level"]
            )
        else:
            return False, 0, 0
    
    except Exception as e:
        logger.error(f"Error getting recording status: {e}")
        return False, 0, 0

def process_audio_file(file_path: str, session_id: str, db=None) -> bool:
    """Process an audio file for transcription and summarization."""
    try:
        from app.utils import transcription_service
        
        # Check if file exists
        if not os.path.exists(file_path):
            logger.error(f"Audio file not found: {file_path}")
            return False
            
        # Convert audio to WAV format with correct parameters if needed
        file_ext = os.path.splitext(file_path)[1].lower()
        if file_ext != ".wav":
            try:
                logger.info(f"Converting {file_ext} file to WAV format")
                temp_wav_path = file_path.replace(file_ext, ".wav")
                
                # Use pydub for conversion
                try:
                    audio = AudioSegment.from_file(file_path)
                    audio = audio.set_frame_rate(16000).set_channels(1)  # Convert to 16kHz mono
                    audio.export(temp_wav_path, format="wav")
                    
                    # Replace original file path with converted WAV
                    file_path = temp_wav_path
                except Exception as conversion_error:
                    logger.error(f"Error converting audio: {conversion_error}")
                    # Continue with original file
            except Exception as e:
                logger.warning(f"Could not convert audio format: {e}. Proceeding with original format.")
        
        # Process with transcription service
        logger.info(f"Starting transcription for session {session_id}")
        return transcription_service.process_audio_file(session_id, file_path, db=db)
    
    except Exception as e:
        logger.error(f"Error processing audio file: {e}")
        return False
