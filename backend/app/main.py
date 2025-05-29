import logging

# Setup logging first to avoid any import errors
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Request
import socketio
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
import os
import uuid
import json
from typing import List, Dict, Optional, Any
import asyncio
import time
import tempfile

# Import our modules
# Import mock device router for prototype demo
from app.routers.devices_router import router as devices_router

# Try importing regular routers but handle import errors
try:
    from app.routers.audio_router import router as audio_router
except ImportError:
    logger.warning("Could not import audio_router, using mock implementation")
    audio_router = None
    
try:
    from app.routers.session_router import router as session_router
except ImportError:
    logger.warning("Could not import session_router, using mock implementation")
    session_router = None
    
try:
    from app.routers.websocket_router import router as websocket_router
except ImportError:
    logger.warning("Could not import websocket_router, using mock implementation")
    websocket_router = None
    
try:
    from app.routers.health import router as health_router
except ImportError:
    logger.warning("Could not import health_router, using mock implementation")
    health_router = None
from app.database import engine, Base, SessionLocal
from app.models import models
# Import managers from utils package
# Import managers directly rather than through the utils package
from app.utils.connection_manager import connection_manager
from app.utils.socketio_manager import socketio_manager, sio
from app.config import settings

# Logger is already set up at the top of the file

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="Clariimeet API",
    description="Backend API for Clariimeet - AI Meeting Companion",
    version="1.0.0",
)

# Add CORS middleware with explicit settings for Socket.IO support
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "*",  # For development only, remove in production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include available routers
# Always include the mock devices router for prototype demo
app.include_router(devices_router)

# Include other routers only if they were successfully imported
if audio_router:
    app.include_router(audio_router)
if session_router:
    app.include_router(session_router)
if websocket_router:
    app.include_router(websocket_router)
if health_router:
    app.include_router(health_router)

# Mount static files directory for downloads if it exists
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/downloads", StaticFiles(directory=uploads_dir), name="downloads")

# Set up Socket.IO with the FastAPI app
# sio is already imported directly from socketio_manager
sio_app = socketio.ASGIApp(sio, app)

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    """
    Handle new Socket.IO connections.
    """
    client_id = str(uuid.uuid4())
    logger.info(f"Socket.IO connection established: {sid}, client_id: {client_id}")
    # Store client_id for this session
    socketio_manager.set_client_id(sid, client_id)
    # Send welcome message
    await sio.emit('connection_status', {
        "status": "connected", 
        "client_id": client_id,
        "message": "Connected to Clarimeet API"
    }, room=sid)

@sio.event
async def disconnect(sid):
    """
    Handle Socket.IO disconnections.
    """
    try:
        client_id = socketio_manager.get_client_id(sid)
        logger.info(f"Socket.IO connection disconnected: {sid}, client_id: {client_id}")
        
        # Use our enhanced disconnect method
        if client_id:
            await socketio_manager.disconnect_client(sid)
    except Exception as e:
        logger.error(f"Error handling disconnect: {e}")

@sio.event
async def chat_message(sid, data):
    """
    Handle chat messages from clients.
    """
    try:
        # Validate request
        if not isinstance(data, dict) or "message" not in data:
            await sio.emit('error', {"message": "Invalid chat message format"}, room=sid)
            return
        
        # Get client and session info
        client_id = socketio_manager.get_client_id(sid)
        session_id = socketio_manager.get_client_session(client_id)
        
        if not session_id:
            await sio.emit('error', {"message": "You are not in a session"}, room=sid)
            return
        
        # Log the message
        logger.info(f"Chat message from {client_id} in session {session_id}: {data['message']}")
        
        # Send the user message to all clients in the session
        user_message = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "from": client_id,
            "to": "all",
            "message": data["message"],
            "timestamp": time.time()
        }
        await sio.emit('chat_message', user_message, room=session_id)
        
        # Generate AI response using our chat service
        await socketio_manager.handle_chat_message(session_id, client_id, data["message"])
    except Exception as e:
        logger.error(f"Error handling chat message: {e}")
        await sio.emit('error', {"message": "Error processing chat message"}, room=sid)

@sio.event
async def join_session(sid, data):
    """
    Handle client joining a session.
    """
    try:
        client_id = socketio_manager.get_client_id(sid)
        if not client_id:
            logger.error(f"No client ID found for SID {sid}")
            await sio.emit('error', {"message": "Client not identified"}, room=sid)
            return
            
        session_id = data.get('session_id')
        if not session_id:
            logger.error("No session ID provided")
            await sio.emit('error', {"message": "No session ID provided"}, room=sid)
            return
            
        # Join the session room
        await sio.enter_room(sid, session_id)
        
        # Store the association in our mapping
        socketio_manager.join_session(client_id, session_id)
        
        # Ensure real-time services are running for this session
        await socketio_manager._ensure_real_services(session_id)
        
        logger.info(f"Client {client_id} joined session {session_id}")
        
        # Send confirmation to the client
        await sio.emit('join_response', {
            "status": "success",
            "session_id": session_id,
            "client_id": client_id
        }, room=sid)
    except Exception as e:
        logger.error(f"Error handling join_session: {e}")

@sio.event
async def audio_chunk(sid, data):
    """
    Handle incoming audio chunks from clients.
    
    Process audio data and return transcription results.
    """
    client_id = socketio_manager.get_client_id(sid)
    session_id = socketio_manager.get_session_id(sid)
    
    if not session_id:
        await sio.emit('error', {"message": "Not connected to any session"}, room=sid)
        return
    
    try:
        # Log receipt of audio data
        logger.info(f"Received audio chunk from client {client_id} for session {session_id}")
        
        # Check if we have audio data to process
        if not data or not isinstance(data, (bytes, bytearray)) and not hasattr(data, 'get'):
            logger.warning(f"Invalid audio data received from client {client_id}")
            await sio.emit('error', {"message": "Invalid audio data format"}, room=sid)
            return
        
        # Handle data depending on format (binary blob or base64 string)
        audio_bytes = None
        if isinstance(data, (bytes, bytearray)):
            # Direct binary data
            audio_bytes = data
            logger.debug(f"Received binary audio data: {len(audio_bytes)} bytes")
        elif isinstance(data, dict) and data.get('audio'):
            # Extract audio data from JSON payload
            if isinstance(data['audio'], str):
                # Handle base64 encoded string
                try:
                    import base64
                    audio_bytes = base64.b64decode(data['audio'])
                    logger.debug(f"Decoded base64 audio data: {len(audio_bytes)} bytes")
                except Exception as e:
                    logger.error(f"Error decoding base64 audio: {e}")
                    await sio.emit('error', {"message": "Error decoding audio data"}, room=sid)
                    return
            elif isinstance(data['audio'], (bytes, bytearray)):
                # Handle binary data in JSON
                audio_bytes = data['audio']
                logger.debug(f"Extracted binary audio from JSON: {len(audio_bytes)} bytes")
        
        if not audio_bytes:
            logger.warning(f"No processable audio data from client {client_id}")
            await sio.emit('error', {"message": "No processable audio data"}, room=sid)
            return
        
        # Process audio using our real transcription service
        from app.utils.deepgram_transcription import transcription_service
        
        # Process the audio chunk with our transcription service
        result = await transcription_service.process_audio_chunk(session_id, audio_bytes)
        
        if result:
            # Forward the result to the client
            await sio.emit('transcription_update', result, room=sid)
            
            # Also broadcast to the session room if needed
            # This allows all clients in the session to see the transcription
            await sio.emit('transcription_update', result, room=session_id)
    
    except Exception as e:
        logger.error(f"Error processing audio chunk: {e}")
        await sio.emit('error', {
            "message": "Error processing audio", 
            "details": str(e)
        }, room=sid)

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to Clariimeet API"}

        



# Health check endpoint is now provided by health_router

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(f"HTTP exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.detail,
            "code": exc.status_code
        },
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    # Log the error with request details
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    logger.error(f"Request path: {request.url.path}")
    
    # In production, we don't want to expose internal error details
    if settings.ENVIRONMENT.lower() == "production":
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Internal server error",
                "code": 500
            },
        )
    else:
        # In development, return more details
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(exc),
                "type": type(exc).__name__,
                "code": 500
            },
        )

# Custom shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Application shutting down...")
    
    # Close any active connections
    active_clients = list(connection_manager.active_connections.keys())
    for client_id in active_clients:
        try:
            await connection_manager.disconnect(client_id)
        except Exception as e:
            logger.warning(f"Error disconnecting client {client_id}: {e}")
    
    logger.info("All connections closed. Shutdown complete.")

if __name__ == "__main__":
    import uvicorn
    # Use the Socket.IO ASGI app instead of the FastAPI app directly
    uvicorn.run("app.main:sio_app", host="0.0.0.0", port=8000, reload=True)
