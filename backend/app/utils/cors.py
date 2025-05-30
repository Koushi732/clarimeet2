#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CORS utilities for Clarimeet

Provides functions and middleware for handling Cross-Origin Resource Sharing (CORS).
"""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

class CustomCORSMiddleware(BaseHTTPMiddleware):
    """
    Custom middleware to add CORS headers to every response, including those from Socket.IO
    """
    
    async def dispatch(self, request: Request, call_next):
        # Process the request and get the response
        response = await call_next(request)
        
        # Add CORS headers to every response
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        
        return response

def setup_cors(app: FastAPI):
    """
    Set up CORS for a FastAPI application with permissive settings for development.
    
    Args:
        app: FastAPI application
    """
    # Add standard CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
    
    # Add custom CORS middleware to ensure headers are added to all responses
    app.add_middleware(CustomCORSMiddleware)
