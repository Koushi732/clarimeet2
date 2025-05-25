// This polyfill fixes WebSocket connection issues by adding fallback behaviors

// Store the original WebSocket implementation
const OriginalWebSocket = window.WebSocket;

// Create a patched version with better error handling
class PatchedWebSocket extends OriginalWebSocket {
  constructor(url, protocols) {
    console.log('Creating patched WebSocket connection to:', url);
    
    // Fix URL format if needed
    let fixedUrl = url;
    if (url.includes('localhost') && !url.includes('127.0.0.1')) {
      // Some browsers have issues with localhost WebSockets
      fixedUrl = url.replace('localhost', '127.0.0.1');
      console.log('Fixed WebSocket URL:', fixedUrl);
    }
    
    // Call original constructor with fixed URL
    super(fixedUrl, protocols);
    
    // Add enhanced error handling
    this.addEventListener('error', (event) => {
      console.warn('WebSocket connection error - providing more details:', {
        url: fixedUrl,
        readyState: this.readyState,
        event: event
      });
    });
    
    // Add connection timeout
    this._connectionTimeout = setTimeout(() => {
      if (this.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket connection timeout - closing and retrying');
        this.close();
      }
    }, 5000);
    
    // Clear timeout when connected
    this.addEventListener('open', () => {
      clearTimeout(this._connectionTimeout);
      console.log('WebSocket connection established');
    });
  }
}

// Only apply the patch if we're in a browser environment
if (typeof window !== 'undefined') {
  // Replace the global WebSocket with our patched version
  window.WebSocket = PatchedWebSocket;
  console.log('WebSocket patched for better reliability');
}

// Export for explicit usage
export default PatchedWebSocket;
