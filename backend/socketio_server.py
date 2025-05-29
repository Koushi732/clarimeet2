from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import socketio
import uvicorn
import logging
import json
import asyncio
import os
from datetime import datetime
import time
from typing import Dict, List, Optional, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI()

# Configure CORS - critical for Socket.IO connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # In production, restrict this
    ping_timeout=60,  # Longer timeout for reliability
    ping_interval=25,  # More frequent pings
    max_http_buffer_size=10_000_000  # 10MB max for audio data
)

# Create ASGI app by combining FastAPI and Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# Mock data storage
mock_sessions = [
    {
        "id": "1",
        "title": "Test Meeting",
        "description": "This is a test meeting session",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "duration": 0,
        "audio_path": None,
        "is_live": False,
        "transcriptions": [],
        "summaries": []
    }
]

# Mock audio devices
mock_audio_devices = [
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

# Socket.IO connection manager to track clients
class SocketManager:
    def __init__(self):
        self.active_clients = {}
        self.session_clients = {}  # Map sessions to clients
    
    def register_client(self, sid, client_id):
        self.active_clients[sid] = client_id
        logger.info(f"Client registered: {client_id} (sid: {sid})")
    
    def remove_client(self, sid):
        if sid in self.active_clients:
            client_id = self.active_clients[sid]
            del self.active_clients[sid]
            
            # Also remove from any sessions
            for session_id, clients in list(self.session_clients.items()):
                if client_id in clients:
                    self.session_clients[session_id].remove(client_id)
                    logger.info(f"Client {client_id} removed from session {session_id}")
            
            logger.info(f"Client removed: {client_id}")
            return client_id
        return None
    
    def join_session(self, client_id, session_id):
        if session_id not in self.session_clients:
            self.session_clients[session_id] = set()
        
        self.session_clients[session_id].add(client_id)
        logger.info(f"Client {client_id} joined session {session_id}")
    
    def get_session_clients(self, session_id):
        return self.session_clients.get(session_id, set())
    
    def get_sid_for_client(self, client_id):
        for sid, cid in self.active_clients.items():
            if cid == client_id:
                return sid
        return None

# Initialize Socket.IO manager
socket_manager = SocketManager()

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    logger.info(f"Socket.IO connection established: {sid}")
    # Initial connection established - client ID will be sent later

@sio.event
async def disconnect(sid):
    client_id = socket_manager.remove_client(sid)
    logger.info(f"Socket.IO client disconnected: {sid} (client_id: {client_id})")

@sio.event
async def client_connect(sid, data):
    client_id = data.get('client_id')
    if not client_id:
        client_id = f"client_{int(time.time() * 1000)}"
    
    socket_manager.register_client(sid, client_id)
    await sio.emit('connection_status', {'status': 'connected', 'client_id': client_id}, room=sid)
    logger.info(f"Client registered with ID: {client_id}")

@sio.event
async def join_session(sid, data):
    client_id = socket_manager.active_clients.get(sid)
    session_id = data.get('session_id')
    
    if not client_id:
        logger.warning(f"Unregistered client attempted to join session: {sid}")
        return
    
    if not session_id:
        logger.warning(f"Client {client_id} tried to join session without session_id")
        return
    
    # Find the session in our mock data
    session = None
    for s in mock_sessions:
        if s["id"] == session_id:
            session = s
            break
    
    if not session:
        # Create new session if it doesn't exist
        session = {
            "id": session_id,
            "title": f"Session {session_id}",
            "description": "Auto-created session",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "duration": 0,
            "audio_path": None,
            "is_live": False,
            "transcriptions": [],
            "summaries": []
        }
        mock_sessions.append(session)
    
    # Add client to session
    socket_manager.join_session(client_id, session_id)
    
    # Notify client that they joined successfully
    await sio.emit('session_joined', {
        'session_id': session_id,
        'client_id': client_id,
        'status': 'joined'
    }, room=sid)
    
    logger.info(f"Client {client_id} joined session {session_id}")

@sio.event
async def audio_chunk(sid, data):
    client_id = socket_manager.active_clients.get(sid)
    if not client_id:
        logger.warning(f"Unregistered client sent audio chunk: {sid}")
        return
    
    # Process audio chunk
    session_id = data.get('session_id')
    if not session_id:
        logger.warning(f"Client {client_id} sent audio chunk without session_id")
        return
    
    # Log audio chunk received (not the data itself as it's too large)
    logger.info(f"Received audio chunk from client {client_id} for session {session_id}")
    
    # In a real implementation, you would:
    # 1. Process the audio for transcription
    # 2. Store the audio chunk if needed
    
    # For mock implementation, we'll send back a fake transcription after a delay
    asyncio.create_task(generate_mock_transcription(session_id, client_id))

@sio.event
async def message(sid, data):
    client_id = socket_manager.active_clients.get(sid)
    if not client_id:
        logger.warning(f"Unregistered client sent message: {sid}")
        return
    
    # Generic message handler
    logger.info(f"Received message from client {client_id}: {data.get('type', 'unknown')}")
    
    # Echo the message back
    await sio.emit('message', {
        'echo': True,
        'original': data,
        'timestamp': time.time()
    }, room=sid)

# Mock transcription generator
async def generate_mock_transcription(session_id, client_id=None):
    # Wait a bit to simulate processing
    await asyncio.sleep(1)
    
    # Create mock transcription
    transcription = {
        'text': "This is a mock transcription. Your audio is being processed.",
        'timestamp': time.time(),
        'session_id': session_id,
        'is_final': True
    }
    
    # Send to all clients in the session
    session_clients = socket_manager.get_session_clients(session_id)
    for cid in session_clients:
        sid = socket_manager.get_sid_for_client(cid)
        if sid:
            await sio.emit('transcription', transcription, room=sid)
    
    # Also generate a summary after a delay
    asyncio.create_task(generate_mock_summary(session_id))

# Mock summary generator
async def generate_mock_summary(session_id):
    # Wait a bit to simulate processing
    await asyncio.sleep(2)
    
    # Create mock summary
    summary = {
        'text': "This is a mock summary of the meeting. Key points discussed include project status and next steps.",
        'timestamp': time.time(),
        'session_id': session_id,
        'summary_type': 'incremental'
    }
    
    # Send to all clients in the session
    session_clients = socket_manager.get_session_clients(session_id)
    for cid in session_clients:
        sid = socket_manager.get_sid_for_client(cid)
        if sid:
            await sio.emit('summary', summary, room=sid)

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Clariimeet Socket.IO API Server"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Sessions API
@app.get("/api/sessions/get")
async def get_sessions():
    return mock_sessions

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    for session in mock_sessions:
        if session["id"] == session_id:
            return session
    raise HTTPException(status_code=404, detail="Session not found")

@app.post("/api/sessions/create")
async def create_session(request: Request):
    data = await request.json()
    new_session = {
        "id": data.get("id", str(len(mock_sessions) + 1)),
        "title": data.get("title", "New Session"),
        "description": data.get("description", ""),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "duration": 0,
        "audio_path": None,
        "is_live": False,
        "transcriptions": [],
        "summaries": []
    }
    
    mock_sessions.append(new_session)
    return new_session

# Audio API
@app.get("/api/audio/devices")
async def get_audio_devices():
    return mock_audio_devices

@app.post("/api/recording/start")
async def start_recording(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID is required")
    
    # Find the session
    for session in mock_sessions:
        if session["id"] == session_id:
            session["is_live"] = True
            session["updated_at"] = datetime.now().isoformat()
            
            # Broadcast recording started to all clients in the session
            session_clients = socket_manager.get_session_clients(session_id)
            for client_id in session_clients:
                sid = socket_manager.get_sid_for_client(client_id)
                if sid:
                    await sio.emit('audio_status', {
                        "session_id": session_id,
                        "status": "recording"
                    }, room=sid)
            
            return {"status": "recording", "session_id": session_id}
    
    raise HTTPException(status_code=404, detail="Session not found")

@app.post("/api/recording/stop")
async def stop_recording(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID is required")
    
    # Find the session
    for session in mock_sessions:
        if session["id"] == session_id:
            session["is_live"] = False
            session["updated_at"] = datetime.now().isoformat()
            
            # Broadcast recording stopped to all clients in the session
            session_clients = socket_manager.get_session_clients(session_id)
            for client_id in session_clients:
                sid = socket_manager.get_sid_for_client(client_id)
                if sid:
                    await sio.emit('audio_status', {
                        "session_id": session_id,
                        "status": "stopped"
                    }, room=sid)
            
            return {"status": "stopped", "session_id": session_id}
    
    raise HTTPException(status_code=404, detail="Session not found")

if __name__ == "__main__":
    # Ensure data directories exist
    os.makedirs("./data/audio", exist_ok=True)
    os.makedirs("./data/sessions", exist_ok=True)
    
    # Start the server
    logger.info("Starting Clariimeet Socket.IO server on port 8000")
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
