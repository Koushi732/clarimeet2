from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os
import json
import asyncio
from datetime import datetime
import uvicorn

# Import app modules
from app.database import get_db, engine, Base
from app.routers.simplified_router import router as api_router

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)

# Create required directories
os.makedirs(os.path.join(os.path.dirname(__file__), 'data'), exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(__file__), 'data', 'audio'), exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(__file__), 'data', 'uploads'), exist_ok=True)

# Initialize FastAPI app
app = FastAPI(
    title="Clariimeet API (Simplified)",
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

# Include routers
app.include_router(api_router)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections = {}
        self.ping_task = None

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
            try:
                await self.active_connections[client_id].send_text(message)
                logger.debug(f"Sent message to client {client_id}: {message[:50]}...")
            except Exception as e:
                logger.error(f"Error sending message to client {client_id}: {e}")
                # Don't disconnect here to allow for retry
    
    async def send_json(self, data: dict, client_id: str):
        """Send JSON data to a specific client"""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(data)
                logger.debug(f"Sent JSON to client {client_id}: {str(data)[:50]}...")
            except Exception as e:
                logger.error(f"Error sending JSON to client {client_id}: {e}")

manager = ConnectionManager()

# WebSocket endpoint for real-time communication
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    
    # First, just establish the connection without sending anything
    # This gives the client time to fully establish the connection
    
    try:
        # Send initial message after a brief delay
        await asyncio.sleep(0.1)  # Small delay to ensure connection is stable
        
        # Send a message matching the expected frontend format
        await websocket.send_json({
            "type": "session_update",  # Use a type that the frontend expects
            "data": {"status": "connected", "clientId": client_id}
        })
        
        # Now receive and process messages
        while True:
            try:
                # Wait for a message from the client
                data = await websocket.receive_text()
                logger.info(f"Received message from {client_id}: {data[:50] if len(data) > 50 else data}")
                
                try:
                    # Parse the message
                    message = json.loads(data)
                    message_type = message.get("type")
                    message_data = message.get("data", {})
                    
                    # Process message based on type
                    if message_type == "audio_status":
                        # Handle audio status update
                        response = {
                            "type": "audio_status",
                            "data": {"received": True, "level": message_data.get("level", 0)}
                        }
                    elif message_type == "transcription":
                        # Handle transcription request
                        response = {
                            "type": "transcription", 
                            "data": {
                                "text": "Mock transcription response", 
                                "timestamp": datetime.now().timestamp()
                            }
                        }
                    else:
                        # Default response - echo back with the same type
                        response = {
                            "type": message_type,
                            "data": {"received": True, "original": message_data}
                        }
                    
                    # Send response directly using WebSocket to avoid any issues
                    await websocket.send_json(response)
                    
                except json.JSONDecodeError:
                    logger.warning(f"Received invalid JSON from client {client_id}")
                    await websocket.send_json({
                        "type": "error",
                        "data": {"message": "Invalid JSON format"}
                    })
                except Exception as process_error:
                    logger.error(f"Error processing message: {process_error}")
                    await websocket.send_json({
                        "type": "error",
                        "data": {"message": "Internal server error"}
                    })
            except WebSocketDisconnect:
                logger.info(f"WebSocket client {client_id} disconnected")
                manager.disconnect(client_id)
                break
            except Exception as e:
                logger.error(f"WebSocket receive error: {e}")
                if "no close frame received or sent" not in str(e).lower():
                    manager.disconnect(client_id)
                    break
    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected during initialization")
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(client_id)

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to Clariimeet API (Simplified)"}

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

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

# For compatibility with original endpoint structure
@app.get("/sessions")
async def get_sessions_forward():
    # Forward to our API implementation
    from app.database import get_db
    db = next(get_db())
    try:
        from app.models.models import Session
        sessions = db.query(Session).all()
        return sessions
    except Exception as e:
        logger.error(f"Error in sessions forwarding: {e}")
        return []
        
@app.get("/sessions/{session_id}")
async def get_session_forward(session_id: str):
    # Forward to our API implementation
    from app.database import get_db
    db = next(get_db())
    try:
        from app.models.models import Session, Transcription, Summary
        session = db.query(Session).filter(Session.id == session_id).first()
        if not session:
            return HTTPException(status_code=404, detail="Session not found")
            
        transcriptions = db.query(Transcription).filter(Transcription.session_id == session_id).all()
        summaries = db.query(Summary).filter(Summary.session_id == session_id).all()
        
        return {
            **session.__dict__,
            "transcriptions": transcriptions,
            "summaries": summaries
        }
    except Exception as e:
        logger.error(f"Error in session forwarding: {e}")
        return HTTPException(status_code=500, detail=str(e))
        
@app.post("/audio/upload")
async def upload_audio_forward(request: Request):
    return await api_router.url_path_for("upload_audio")(request)
    
@app.get("/audio/devices")
async def get_devices_forward():
    # Forward to our API implementation
    from app.utils.simplified_audio import get_audio_devices
    return get_audio_devices()

if __name__ == "__main__":
    logger.info("Starting Clariimeet backend server")
    uvicorn.run(app, host="0.0.0.0", port=8000)
