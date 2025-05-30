import { io, Socket } from 'socket.io-client';

// Simple WebSocket connection helper with robust error handling
export class WebSocketHelper {
  private socket: Socket | null = null;
  private url: string;
  private clientId: string;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageHandlers: Array<(event: string, data: any) => void> = [];
  private connectionHandlers: Array<(status: string) => void> = [];

  constructor(url: string, clientId: string) {
    // Ensure URL doesn't end with a slash
    this.url = url.endsWith('/') ? url.slice(0, -1) : url;
    this.clientId = clientId;
    
    // Attempt immediate connection
    setTimeout(() => this.connect(), 0);
  }

  // Connect to the WebSocket server
  public connect(): boolean {
    if (this.socket) {
      try {
        if (this.socket.connected) {
          console.log('Already connected to WebSocket server');
          return true;
        }
        this.disconnect();
      } catch (e) {
        console.error('Error checking existing socket:', e);
        this.socket = null;
      }
    }

    try {
      console.log(`Connecting to WebSocket server at ${this.url} with client ID ${this.clientId}`);
      
      // Enhanced Socket.IO connection options
      this.socket = io(this.url, {
        // Try both transport methods, with websocket preferred
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity, // Never stop trying to reconnect
        reconnectionDelay: 1000, // Start with 1s delay
        reconnectionDelayMax: 10000, // Max 10s delay between reconnection attempts
        timeout: 30000, // Longer connection timeout
        autoConnect: true,
        forceNew: true, // Force a new connection
        query: { 
          clientId: this.clientId,
          timestamp: Date.now() // Add timestamp to avoid cache issues
        },
        extraHeaders: {
          'X-Client-ID': this.clientId // Also send in headers for more reliable transport
        }
      });

      // Set up event handlers with more detailed logging
      this.socket.on('connect', () => {
        console.log(`WebSocket connection established to ${this.url}`);
        this.connected = true;
        this.notifyConnectionHandlers('connected');
        
        // Reset reconnect attempts on successful connection
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        
        // Setup ping interval to keep connection alive
        this.setupPingInterval();
      });

      this.socket.on('disconnect', (reason) => {
        console.log(`WebSocket disconnected. Reason: ${reason}`);
        this.connected = false;
        this.notifyConnectionHandlers('disconnected');
        
        // Don't reconnect if the disconnection was intentional
        if (reason !== 'io client disconnect') {
          this.tryReconnect();
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error(`WebSocket connection error: ${error.message}`);
        this.connected = false;
        this.notifyConnectionHandlers('error');
        this.tryReconnect();
      });

      this.socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.notifyConnectionHandlers('error');
      });
      
      // Listen for pong response to keep connection alive
      this.socket.on('pong', () => {
        console.log('Received pong from server');
      });

      // Generic message handler with better error handling
      this.socket.onAny((event, ...args) => {
        try {
          if (event !== 'pong') { // Don't log ping/pong messages
            console.log(`Received WebSocket event: ${event}`, args);
          }
          this.notifyMessageHandlers(event, args[0]);
        } catch (error) {
          console.error(`Error handling WebSocket event ${event}:`, error);
        }
      });

      return true;
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.notifyConnectionHandlers('error');
      this.tryReconnect();
      return false;
    }
  }

  // Disconnect from the WebSocket server
  public disconnect(): void {
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (error) {
        console.error('Error disconnecting WebSocket:', error);
      }
      this.socket = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Clear ping interval
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }

    this.connected = false;
  }

  // Try to reconnect to the WebSocket server
  private tryReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      this.connect();
    }, 2000);
  }
  
  // Setup ping interval to keep connection alive
  private pingIntervalId: NodeJS.Timeout | null = null;
  
  private setupPingInterval(): void {
    // Clear any existing ping interval
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    
    // Set up ping every 25 seconds to prevent timeouts
    this.pingIntervalId = setInterval(() => {
      if (this.socket && this.connected) {
        console.log('Sending ping to server');
        this.socket.emit('ping');
      }
    }, 25000);
  }

  // Send a message through the WebSocket
  public send(event: string, data: any): boolean {
    if (!this.socket || !this.connected) {
      console.warn(`Cannot send message to event ${event}, socket not connected`);
      return false;
    }

    try {
      console.log(`Sending WebSocket event: ${event}`, data);
      this.socket.emit(event, data);
      return true;
    } catch (error) {
      console.error(`Error sending WebSocket event ${event}:`, error);
      return false;
    }
  }

  // Join a session
  public joinSession(sessionId: string): boolean {
    console.log(`Joining session ${sessionId}`);
    return this.send('join_session', { session_id: sessionId });
  }

  // Add a message handler
  public addMessageHandler(handler: (event: string, data: any) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  // Add a connection status handler
  public addConnectionHandler(handler: (status: string) => void): () => void {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
    };
  }

  // Notify all message handlers
  private notifyMessageHandlers(event: string, data: any): void {
    this.messageHandlers.forEach(handler => {
      try {
        handler(event, data);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  // Notify all connection handlers
  private notifyConnectionHandlers(status: string): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(status);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }

  // Check if connected
  public isConnected(): boolean {
    return this.connected;
  }

  // Get the client ID
  public getClientId(): string {
    return this.clientId;
  }
}
