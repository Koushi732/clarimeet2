# Import the routers to make them available through the package

# Map old router names to new router files for backward compatibility
import app.routers.audio_router as audio
import app.routers.session_router as sessions
import app.routers.websocket_router as websocket

# For direct imports of the new router modules
from app.routers.audio_router import router as audio_router
from app.routers.session_router import router as session_router
from app.routers.websocket_router import router as websocket_router
