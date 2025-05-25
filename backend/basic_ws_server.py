from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import logging
import json
from typing import Dict, List, Any
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
    allow_origins=["*"],  # In production, this should be restricted
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock data
mock_sessions = [
    {
        "id": "1",
        "title": "Mock Session 1",
        "description": "A test session",
        "created_at": "2023-01-01T00:00:00Z",
        "updated_at": "2023-01-01T00:00:00Z",
        "duration": 3600,
        "audio_path": None,
        "is_live": False
    }
]

# API endpoints
@app.get("/")
async def root():
    return {"status": "ok"}

@app.get("/sessions")
async def get_sessions():
    return mock_sessions

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    for session in mock_sessions:
        if session["id"] == session_id:
            return session
    return {"error": "Session not found"}

@app.get("/audio/devices")
async def get_audio_devices():
    return [
        {
            "id": "default",
            "name": "Default Microphone",
            "is_input": True,
            "is_default": True,
            "is_loopback": False
        }
    ]

# Store WebSocket connections
active_connections: Dict[str, WebSocket] = {}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    # Accept the connection
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for client {client_id}")
    
    # Store the connection
    active_connections[client_id] = websocket
    
    try:
        # Send a test message immediately to verify connection
        test_message = {
            "type": "session_update",
            "data": {
                "status": "connected"
            }
        }
        await websocket.send_json(test_message)
        logger.info(f"Sent test message to client {client_id}")
        
        # Process messages
        while True:
            try:
                # Wait for a message
                message = await websocket.receive_text()
                logger.info(f"Received message from client {client_id}: {message[:100]}")
                
                # Parse the message
                parsed_message = json.loads(message)
                
                # Just echo the message back with same type
                response = {
                    "type": parsed_message.get("type", "echo"),
                    "data": parsed_message.get("data", {})
                }
                
                # Send the response
                await websocket.send_json(response)
                logger.info(f"Sent response to client {client_id}")
                
            except json.JSONDecodeError:
                logger.error(f"Failed to parse message from client {client_id}")
                
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"Error handling WebSocket for client {client_id}: {e}")
    finally:
        # Remove the connection
        if client_id in active_connections:
            del active_connections[client_id]

if __name__ == "__main__":
    logger.info("Starting WebSocket server on port 8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
