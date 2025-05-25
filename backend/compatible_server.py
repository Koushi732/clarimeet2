from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import json
from typing import Dict, List, Optional, Any
import uvicorn
from datetime import datetime
import time
import asyncio
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI()

# Configure CORS - critical for WebSocket connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Connection manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client connected: {client_id}")
        
        # Send initial confirmation message
        await self.send_message(client_id, "session_update", {"status": "connected"})
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client disconnected: {client_id}")
    
    async def send_message(self, client_id: str, message_type: str, data: Any):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json({
                    "type": message_type,
                    "data": data
                })
                logger.info(f"Message sent to {client_id}: {message_type}")
                return True
            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
                return False
        return False
    
    async def broadcast(self, message_type: str, data: Any):
        for client_id in list(self.active_connections.keys()):
            await self.send_message(client_id, message_type, data)

# Initialize connection manager
manager = ConnectionManager()

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Clariimeet API Server"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Sessions API
@app.get("/sessions")
async def get_sessions():
    return mock_sessions

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    for session in mock_sessions:
        if session["id"] == session_id:
            return session
    raise HTTPException(status_code=404, detail="Session not found")

@app.post("/sessions")
async def create_session(request: Request):
    data = await request.json()
    new_session = {
        "id": str(len(mock_sessions) + 1),
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
    mock_sessions.append(new_session)
    
    # Broadcast session update to all clients
    await manager.broadcast("session_update", new_session)
    return new_session

# Audio API
@app.get("/audio/devices")
async def get_audio_devices():
    return mock_audio_devices

@app.post("/audio/start-recording")
async def start_recording(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    device_id = data.get("device_id", "default")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    # Update session status
    for session in mock_sessions:
        if session["id"] == session_id:
            session["is_live"] = True
            session["updated_at"] = datetime.now().isoformat()
            
            # Broadcast audio status update
            await manager.broadcast("audio_status", {
                "session_id": session_id,
                "status": "recording",
                "device_id": device_id
            })
            
            return {"status": "recording", "session_id": session_id}
    
    raise HTTPException(status_code=404, detail="Session not found")

@app.post("/audio/stop-recording")
async def stop_recording(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    # Update session status
    for session in mock_sessions:
        if session["id"] == session_id:
            session["is_live"] = False
            session["updated_at"] = datetime.now().isoformat()
            end_time = time.time()
            
            # Broadcast audio status update
            await manager.broadcast("audio_status", {
                "session_id": session_id,
                "status": "stopped",
            })
            
            # Generate mock transcription after stopping
            asyncio.create_task(generate_mock_transcription(session_id))
            
            return {"status": "stopped", "session_id": session_id}
    
    raise HTTPException(status_code=404, detail="Session not found")

# Mock transcription generation
async def generate_mock_transcription(session_id: str):
    # Wait a bit to simulate processing
    await asyncio.sleep(2)
    
    # Send transcription update
    mock_transcription = {
        "session_id": session_id,
        "text": "This is a mock transcription for the meeting. The system is working as expected.",
        "timestamp": time.time(),
        "is_final": True
    }
    
    # Send transcription via WebSocket
    await manager.broadcast("transcription", mock_transcription)
    
    # Generate summary after transcription
    asyncio.create_task(generate_mock_summary(session_id))

# Mock summary generation
async def generate_mock_summary(session_id: str):
    # Wait a bit to simulate processing
    await asyncio.sleep(3)
    
    # Send summary update
    mock_summary = {
        "session_id": session_id,
        "text": "Meeting Summary: The team discussed project progress and next steps.",
        "type": "overall",
        "timestamp": time.time()
    }
    
    # Send summary via WebSocket
    await manager.broadcast("summary", mock_summary)

# WebSocket endpoint
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    # Accept connection
    await manager.connect(client_id, websocket)
    
    try:
        while True:
            # Wait for messages from client
            message_json = await websocket.receive_text()
            
            try:
                # Parse message
                message = json.loads(message_json)
                message_type = message.get("type")
                message_data = message.get("data", {})
                
                logger.info(f"Received message from {client_id}: {message_type}")
                
                # Process message based on type
                if message_type == "session_update":
                    # Client is requesting session updates
                    await manager.send_message(client_id, "session_update", {
                        "sessions": mock_sessions
                    })
                elif message_type == "audio_status":
                    # Client is asking about audio status
                    session_id = message_data.get("session_id")
                    if session_id:
                        for session in mock_sessions:
                            if session["id"] == session_id:
                                await manager.send_message(client_id, "audio_status", {
                                    "session_id": session_id,
                                    "status": "recording" if session["is_live"] else "stopped"
                                })
                else:
                    # Echo back unknown message types
                    await manager.send_message(client_id, message_type, message_data)
            
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received from {client_id}")
            except Exception as e:
                logger.error(f"Error processing message from {client_id}: {e}")
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
        manager.disconnect(client_id)

if __name__ == "__main__":
    # Ensure data directories exist
    os.makedirs("./data/audio", exist_ok=True)
    os.makedirs("./data/sessions", exist_ok=True)
    
    # Start the server
    logger.info("Starting Clariimeet compatible server on port 8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
