from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
import logging
import os
import uuid
import json
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Clariimeet API",
    description="Backend API for Clariimeet - AI Meeting Companion",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, this should be restricted
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create data directory if it doesn't exist
os.makedirs(os.path.join(os.path.dirname(__file__), 'data'), exist_ok=True)

# Mock database
sessions = []

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client {client_id} disconnected. Remaining connections: {len(self.active_connections)}")

    async def send_message(self, message: str, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_text(message)

    async def broadcast(self, message: str):
        for client_id, connection in self.active_connections.items():
            await connection.send_text(message)

manager = ConnectionManager()

# Helper functions
def get_mock_sessions():
    """Generate some mock sessions"""
    if not sessions:
        for i in range(5):
            session_id = str(uuid.uuid4())
            sessions.append({
                "id": session_id,
                "title": f"Test Session {i+1}",
                "description": f"Description for test session {i+1}",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "duration": 60 * (i+1),  # Duration in seconds
                "audio_path": None,
                "is_live": i % 2 == 0,  # Alternating live/uploaded
                "transcriptions": [],
                "summaries": []
            })
    return sessions

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to Clariimeet API"}

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Sessions endpoints
@app.get("/sessions")
async def get_all_sessions():
    return get_mock_sessions()

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    sessions_list = get_mock_sessions()
    for session in sessions_list:
        if session["id"] == session_id:
            return session
    raise HTTPException(status_code=404, detail="Session not found")

@app.put("/sessions/{session_id}")
async def update_session(session_id: str, session_update: dict):
    sessions_list = get_mock_sessions()
    for session in sessions_list:
        if session["id"] == session_id:
            if "title" in session_update:
                session["title"] = session_update["title"]
            if "description" in session_update:
                session["description"] = session_update["description"]
            return session
    raise HTTPException(status_code=404, detail="Session not found")

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    sessions_list = get_mock_sessions()
    for i, session in enumerate(sessions_list):
        if session["id"] == session_id:
            del sessions_list[i]
            return {"message": "Session deleted successfully"}
    raise HTTPException(status_code=404, detail="Session not found")

# Audio endpoints
@app.get("/audio/devices")
async def get_audio_devices():
    # Return mock audio devices
    return [
        {
            "id": "1",
            "name": "Default Microphone",
            "is_input": True,
            "is_default": True,
            "is_loopback": False
        },
        {
            "id": "2",
            "name": "System Audio",
            "is_input": False,
            "is_default": False,
            "is_loopback": True
        }
    ]

@app.post("/audio/upload")
async def upload_audio(title: str, description: Optional[str] = None):
    # Create a new mock session
    session_id = str(uuid.uuid4())
    new_session = {
        "id": session_id,
        "title": title,
        "description": description or "",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "duration": 120,  # Mock duration
        "audio_path": None,
        "is_live": False,
        "transcriptions": [],
        "summaries": []
    }
    sessions.append(new_session)
    return new_session

@app.post("/audio/start")
async def start_recording(device_id: str, title: str, description: Optional[str] = None):
    # Create a new mock session
    session_id = str(uuid.uuid4())
    new_session = {
        "id": session_id,
        "title": title,
        "description": description or "",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "duration": 0,  # Starting duration
        "audio_path": None,
        "is_live": True,
        "transcriptions": [],
        "summaries": []
    }
    sessions.append(new_session)
    return new_session

@app.post("/audio/stop/{session_id}")
async def stop_recording(session_id: str):
    for session in sessions:
        if session["id"] == session_id:
            session["duration"] = 60  # Mock duration after stopping
            return session
    raise HTTPException(status_code=404, detail="Session not found")

@app.get("/audio/status/{session_id}")
async def get_recording_status(session_id: str):
    for session in sessions:
        if session["id"] == session_id:
            return {
                "session_id": session_id,
                "is_recording": session["is_live"],
                "duration": session["duration"],
                "audio_level": 0.5  # Mock audio level
            }
    raise HTTPException(status_code=404, detail="Session not found")

# WebSocket endpoint for real-time communication
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo the message back
            await manager.send_message(f"You sent: {data}", client_id)
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(client_id)

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error"},
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
