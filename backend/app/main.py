from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
import logging
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
from app.utils.connection_manager import connection_manager
from app.config import settings

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)

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

# Legacy WebSocket endpoint for backward compatibility
@app.websocket("/ws/{client_id}")
async def legacy_websocket_endpoint(websocket: WebSocket, client_id: str):
    await connection_manager.connect(client_id, websocket)
    try:
        # Send welcome message
        await connection_manager.send_message(
            client_id=client_id,
            message_type="system",
            data={"message": "Connected to Clariimeet API - Please use the new WebSocket endpoints"}
        )
        
        while True:
            # Process messages using the new connection manager
            await connection_manager.receive_and_process(client_id)
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected from legacy endpoint")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await connection_manager.disconnect(client_id)

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
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
