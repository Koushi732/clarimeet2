/**
 * A very simple and reliable WebSocket client implementation
 * This bypasses Socket.IO completely for maximum reliability
 */

type MessageHandler = (event: string, data: any) => void;
type StatusHandler = (status: string) => void;

export class DirectWebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private clientId: string;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private sessionId: string | null = null;
  
  constructor(host: string, port: number, clientId: string) {
    // By default, connect to the proxy server on port 8080
    // This provides more reliable WebSocket connections
    const proxyHost = host;
    const proxyPort = 8080; // Default proxy port
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${protocol}://${proxyHost}:${proxyPort}`;
    this.clientId = clientId;
    
    // Connect immediately in the next tick
    setTimeout(() => this.connect(), 0);
  }
  
  public connect(): boolean {
    try {
      // Clear any existing socket
      this.disconnect(false);
      
      // Create query parameters
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('t', Date.now().toString()); // Add timestamp to bust cache
      if (this.sessionId) {
        params.append('session_id', this.sessionId);
      }
      
      // Create new WebSocket with query parameters
      const fullUrl = `${this.url}?${params.toString()}`;
      console.log(`Connecting to WebSocket: ${fullUrl}`);
      
      this.socket = new WebSocket(fullUrl);
      
      // Set up event handlers
      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      
      return true;
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.updateStatus('error');
      this.tryReconnect();
      return false;
    }
  }
  
  public disconnect(notify: boolean = true): void {
    if (this.socket) {
      // Remove event handlers to prevent reconnect loops
      this.socket.onclose = null;
      this.socket.onerror = null;
      
      try {
        this.socket.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      
      this.socket = null;
    }
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    
    // Update state
    if (this.connected && notify) {
      this.connected = false;
      this.updateStatus('disconnected');
    }
  }
  
  private handleOpen(event: Event): void {
    console.log('WebSocket connection established');
    this.connected = true;
    this.reconnectAttempts = 0;
    this.updateStatus('connected');
    
    // Send join session message if we have a session ID
    if (this.sessionId) {
      this.joinSession(this.sessionId);
    }
    
    // Start ping timer
    this.startPingTimer();
  }
  
  private handleClose(event: CloseEvent): void {
    console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
    this.connected = false;
    this.updateStatus('disconnected');
    this.tryReconnect();
  }
  
  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.updateStatus('error');
  }
  
  private handleMessage(event: MessageEvent): void {
    try {
      // Check if the message is binary data
      if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
        console.log('Received binary WebSocket data');
        
        // For binary data, use a special event type
        const eventType = 'binary_data';
        const payload = event.data;
        
        // Notify all message handlers
        this.messageHandlers.forEach(handler => {
          try {
            handler(eventType, payload);
          } catch (error) {
            console.error('Error in binary message handler:', error);
          }
        });
        
        return;
      }
      
      // For text data, parse as JSON
      const data = JSON.parse(event.data);
      
      // Extract the event type and payload
      const eventType = data.event || 'message';
      const payload = data.data || data;
      
      console.log(`Received WebSocket event: ${eventType}`, payload);
      
      // Notify all message handlers
      this.messageHandlers.forEach(handler => {
        try {
          handler(eventType, payload);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }
  
  private tryReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Implement exponential backoff
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }
  
  private startPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
    
    // Send a ping every 15 seconds to keep the connection alive
    this.pingTimer = setInterval(() => {
      if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, 15000);
  }
  
  private sendPing(): void {
    this.send('ping', { timestamp: Date.now() });
  }
  
  private updateStatus(status: string): void {
    this.statusHandlers.forEach(handler => {
      try {
        handler(status);
      } catch (error) {
        console.error('Error in status handler:', error);
      }
    });
  }
  
  // Public API
  
  public send(event: string, data: any): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn(`Cannot send message to event ${event}, socket not connected`);
      return false;
    }
    
    try {
      // Format the message as expected by the server
      const message = JSON.stringify({
        event,
        data
      });
      
      console.log(`Sending WebSocket event: ${event}`, data);
      this.socket.send(message);
      return true;
    } catch (error) {
      console.error(`Error sending WebSocket event ${event}:`, error);
      return false;
    }
  }
  
  public joinSession(sessionId: string): boolean {
    this.sessionId = sessionId;
    return this.send('join_session', { session_id: sessionId });
  }
  
  public addMessageHandler(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }
  
  public addStatusHandler(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }
  
  public isConnected(): boolean {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }
  
  public getClientId(): string {
    return this.clientId;
  }
  
  public getSessionId(): string | null {
    return this.sessionId;
  }
}
