from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os
import json
from datetime import datetime
from typing import Dict, List, Any
import uvicorn

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Clariimeet WebSocket Server",
    description="Minimal WebSocket server for Clariimeet",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock data
mock_sessions = [
    {
        "id": "1",
        "title": "Mock Session 1",
        "description": "This is a mock session for testing",
        "created_at": "2023-01-01T12:00:00Z",
        "updated_at": "2023-01-01T12:00:00Z",
        "duration": 3600,
        "audio_path": None,
        "is_live": False,
        "transcriptions": [],
        "summaries": []
    },
    {
        "id": "2",
        "title": "Mock Session 2",
        "description": "Another mock session",
        "created_at": "2023-01-02T12:00:00Z",
        "updated_at": "2023-01-02T12:00:00Z",
        "duration": 1800,
        "audio_path": None,
        "is_live": True,
        "transcriptions": [],
        "summaries": []
    }
]

# Basic API endpoints to keep the frontend happy
@app.get("/sessions")
async def get_sessions():
    return mock_sessions

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    for session in mock_sessions:
        if session["id"] == session_id:
            return session
    return {"message": "Session not found"}

@app.get("/audio/devices")
async def get_audio_devices():
    return [
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

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Clariimeet WebSocket Server"}

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Active WebSocket connections
connections = {}

# Extremely simple WebSocket endpoint
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    # Accept the connection
    await websocket.accept()
    logger.info(f"Client {client_id} connected")
    
    # Store the connection
    connections[client_id] = websocket
    
    try:
        # Just keep the connection open and echo back any messages
        while True:
            # Wait for messages
            try:
                # Receive and parse message
                message = await websocket.receive_json()
                logger.info(f"Received message from {client_id}: {message}")
                
                # Echo back with the same structure
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                # Continue listening even if there's an error
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Clean up connection
        if client_id in connections:
            del connections[client_id]
            logger.info(f"Client {client_id} disconnected")

if __name__ == "__main__":
    logger.info("Starting minimal WebSocket server")
    uvicorn.run(app, host="0.0.0.0", port=8000)
