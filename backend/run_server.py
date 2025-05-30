#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Entry point for the Clarimeet backend server.
This file imports the Socket.IO ASGI app from the app.main module.
"""

# First, initialize the SQLAlchemy models
from app.database import init_models
init_models()

# Then import the Socket.IO ASGI app instead of the FastAPI app
# This is critical for Socket.IO to work properly
from app.main import sio_app as app

# This file is referenced by the startup script:
# uvicorn run_server:app --host 0.0.0.0 --port 8000 --reload
