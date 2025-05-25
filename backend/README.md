# Clariimeet Backend

The backend service for Clariimeet, an AI-powered meeting companion that provides real-time transcription and summarization of audio.

## Features

- Audio recording and file upload
- Real-time transcription using Whisper
- Summarization using transformer models
- WebSocket communication for real-time updates
- REST API for session management
- SQLite database for persistent storage

## Requirements

- Python 3.8+
- FastAPI
- SQLAlchemy
- PyAudio (for audio recording)
- Whisper (for transcription)
- Transformers (for summarization)

## Installation

1. Clone the repository
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the server:

```bash
python run_server.py
```

The server will be available at http://localhost:8000

## API Endpoints

### Audio
- `GET /audio/devices` - Get available audio devices
- `POST /audio/upload` - Upload an audio file for processing
- `POST /audio/start` - Start a live recording session
- `POST /audio/stop/{session_id}` - Stop a recording session
- `GET /audio/status/{session_id}` - Get recording status

### Sessions
- `GET /sessions` - Get all sessions
- `GET /sessions/{session_id}` - Get a specific session
- `PUT /sessions/{session_id}` - Update a session
- `DELETE /sessions/{session_id}` - Delete a session
- `GET /sessions/{session_id}/export` - Export session data

### Transcription
- `POST /transcription/start/{session_id}` - Start transcription
- `POST /transcription/stop/{session_id}` - Stop transcription
- `GET /transcription/status/{session_id}` - Get transcription status

### Summarization
- `POST /summarization/generate/{session_id}` - Generate a summary
- `POST /summarization/start/{session_id}` - Start real-time summarization
- `POST /summarization/stop/{session_id}` - Stop summarization
- `GET /summarization/status/{session_id}` - Get summarization status

## WebSocket API

Connect to `/ws/{client_id}` to receive real-time updates.

### Message Types
- Audio level updates
- Transcription updates
- Summarization updates

## Database Schema

### Sessions
- id: UUID (primary key)
- title: String
- description: Text
- created_at: DateTime
- updated_at: DateTime
- duration: Float (seconds)
- audio_path: String (file path)
- is_live: Boolean

### Transcriptions
- id: UUID (primary key)
- session_id: UUID (foreign key)
- timestamp: Float (seconds)
- end_timestamp: Float (seconds)
- text: Text
- confidence: Float
- speaker: String (optional)
- created_at: DateTime

### Summaries
- id: UUID (primary key)
- session_id: UUID (foreign key)
- summary_type: String
- text: Text
- segment_start: Float (seconds, optional)
- segment_end: Float (seconds, optional)
- created_at: DateTime

## Fallback Implementation

The backend includes fallback implementations for cases when optional dependencies are not available:

- When Whisper is not installed, a basic transcription placeholder is used
- When Transformers is not installed, an extractive summarization method is used instead
