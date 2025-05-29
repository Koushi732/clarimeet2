# Export the socketio_manager for easier importing
try:
    from .socketio_manager import socketio_manager
except ImportError:
    socketio_manager = None
    
# Export the connection_manager for easier importing
try:
    from .connection_manager import connection_manager
except ImportError:
    connection_manager = None
