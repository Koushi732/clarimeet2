"""Audio devices router that returns mock devices for prototype demo"""

from fastapi import APIRouter, HTTPException
from ..utils.mock_services import get_mock_audio_devices

router = APIRouter(prefix="/audio", tags=["audio"])

@router.get("/devices")
async def get_audio_devices():
    """Get available audio devices (mock implementation)"""
    try:
        # Return devices as a direct array, not wrapped in an object
        # This matches what the frontend expects
        return get_mock_audio_devices()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching audio devices: {str(e)}")
