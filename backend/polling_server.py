from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import json
from datetime import datetime
import time
import asyncio
import uuid
import os
from typing import Dict, List, Any, Optional
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory data storage
message_queues: Dict[str, List[Dict[str, Any]]] = {}
sessions: List[Dict[str, Any]] = [
    {
        "id": "1",
        "title": "Test Meeting",
        "description": "This is a test meeting",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "duration": 0,
        "audio_path": None,
        "is_live": False,
        "transcriptions": [],
        "summaries": []
    }
]
devices = [
    {
        "id": "default",
        "name": "Default Microphone",
        "is_input": True,
        "is_default": True,
        "is_loopback": False
    },
    {
        "id": "system",
        "name": "System Audio",
        "is_input": False,
        "is_default": False,
        "is_loopback": True
    }
]

# Helper functions
def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    for session in sessions:
        if session["id"] == session_id:
            return session
    return None

# Initialize message queue for a client
def init_client_queue(client_id: str):
    if client_id not in message_queues:
        message_queues[client_id] = []
        logger.info(f"Initialized message queue for client {client_id}")

# Add message to client queue
def add_message(client_id: str, message_type: str, data: Any):
    init_client_queue(client_id)
    message = {
        "type": message_type,
        "data": data,
        "timestamp": time.time()
    }
    message_queues[client_id].append(message)
    logger.info(f"Added message to client {client_id} queue: {message_type}")

# Broadcast message to all clients
def broadcast_message(message_type: str, data: Any):
    for client_id in message_queues.keys():
        add_message(client_id, message_type, data)
    logger.info(f"Broadcasted message to all clients: {message_type}")

# API Routes
@app.get("/")
async def root():
    return {"message": "Clariimeet API Server (Polling Mode)"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Client registration and polling
@app.post("/api/register")
async def register_client(request: Request):
    data = await request.json()
    client_id = data.get("client_id", str(uuid.uuid4()))
    
    init_client_queue(client_id)
    
    # Send initial connection confirmation
    add_message(client_id, "session_update", {"status": "connected"})
    
    return {"client_id": client_id, "status": "registered"}

@app.get("/api/poll/{client_id}")
async def poll_messages(client_id: str, since: Optional[float] = None):
    init_client_queue(client_id)
    
    if since is not None:
        # Return only messages newer than 'since' timestamp
        messages = [msg for msg in message_queues[client_id] if msg["timestamp"] > since]
    else:
        # Return all pending messages
        messages = message_queues[client_id].copy()
    
    # Clear delivered messages
    if messages and since is not None:
        message_queues[client_id] = [msg for msg in message_queues[client_id] if msg["timestamp"] > since]
    
    return {"messages": messages, "timestamp": time.time()}

# Session management
@app.get("/sessions")
async def get_sessions():
    return sessions

@app.get("/sessions/{session_id}")
async def get_session_by_id(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.post("/sessions")
async def create_session(request: Request):
    data = await request.json()
    session_id = str(len(sessions) + 1)
    
    new_session = {
        "id": session_id,
        "title": data.get("title", "New Session"),
        "description": data.get("description", ""),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "duration": 0,
        "audio_path": None,
        "is_live": True,
        "transcriptions": [],
        "summaries": []
    }
    
    sessions.append(new_session)
    broadcast_message("session_update", new_session)
    
    return new_session

# Audio device management
@app.get("/audio/devices")
async def get_audio_devices():
    return devices

# Audio recording management
@app.post("/audio/start-recording")
async def start_recording(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    device_id = data.get("device_id", "default")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session["is_live"] = True
    session["updated_at"] = datetime.now().isoformat()
    
    # Notify clients about recording status
    broadcast_message("audio_status", {
        "session_id": session_id,
        "status": "recording",
        "device_id": device_id
    })
    
    # Start mock transcription updates
    asyncio.create_task(generate_mock_updates(session_id))
    
    return {"status": "recording", "session_id": session_id}

@app.post("/audio/stop-recording")
async def stop_recording(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session["is_live"] = False
    session["updated_at"] = datetime.now().isoformat()
    
    # Notify clients about recording status
    broadcast_message("audio_status", {
        "session_id": session_id,
        "status": "stopped"
    })
    
    return {"status": "stopped", "session_id": session_id}

# Mock data generation for transcription and summaries
async def generate_mock_updates(session_id: str):
    # Wait a bit to simulate processing
    await asyncio.sleep(2)
    
    # Generate mock transcription
    transcription = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "text": "This is a mock transcription for testing purposes. The system appears to be working correctly.",
        "timestamp": time.time()
    }
    
    # Send transcription to all clients
    broadcast_message("transcription", transcription)
    
    # Wait a bit more for summary
    await asyncio.sleep(3)
    
    # Generate mock summary
    summary = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "text": "Meeting Summary: The team discussed project progress and next steps. Action items were assigned.",
        "type": "overall",
        "timestamp": time.time()
    }
    
    # Send summary to all clients
    broadcast_message("summary", summary)

# Define a WebSocket compatibility endpoint that simply returns a 404
# This prevents the frontend from continuously trying to connect to WebSocket
@app.get("/ws/{client_id}")
async def websocket_fallback(client_id: str):
    return JSONResponse(
        status_code=404,
        content={"message": "WebSockets are not supported by this server. Please use the polling API instead."}
    )

# Initialize the server
if __name__ == "__main__":
    # Ensure data directories exist
    os.makedirs("./data/audio", exist_ok=True)
    os.makedirs("./data/sessions", exist_ok=True)
    
    logger.info("Starting Clariimeet polling server on port 8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
