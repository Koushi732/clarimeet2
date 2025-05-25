/**
 * Startup Optimizer for Clarimeet
 * Handles progressive loading of app components for faster startup
 */

import { Session } from '../types';

interface StartupConfig {
  preloadAssets: boolean;
  lazyLoadComponents: boolean;
  cacheSessions: boolean;
  maxCachedSessions: number;
}

// Default configuration
const defaultConfig: StartupConfig = {
  preloadAssets: true,
  lazyLoadComponents: true,
  cacheSessions: true,
  maxCachedSessions: 10
};

class StartupOptimizer {
  private config: StartupConfig;
  private sessionCache: Map<string, Session>;
  private isInitialized: boolean = false;

  constructor(config: Partial<StartupConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.sessionCache = new Map();
  }

  /**
   * Initialize the optimizer
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('🚀 Initializing Clarimeet startup optimizer');
    
    if (this.config.preloadAssets) {
      await this.preloadCriticalAssets();
    }
    
    if (this.config.cacheSessions) {
      this.loadSessionCache();
    }
    
    this.isInitialized = true;
    console.log('✅ Startup optimization complete');
  }

  /**
   * Preload critical assets for faster rendering
   */
  private async preloadCriticalAssets(): Promise<void> {
    console.log('⏳ Preloading critical assets');
    
    // Preload important images
    const imagesToPreload = [
      '/logo192.png',
      '/favicon.ico'
    ];
    
    const preloadPromises = imagesToPreload.map(imagePath => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Continue even if some assets fail to load
        img.src = imagePath;
      });
    });
    
    await Promise.all(preloadPromises);
  }

  /**
   * Load session cache from localStorage
   */
  private loadSessionCache(): void {
    console.log('⏳ Loading session cache');
    
    try {
      const cachedData = localStorage.getItem('clarimeet-session-cache');
      
      if (cachedData) {
        const sessions = JSON.parse(cachedData) as Session[];
        
        // Ensure we don't exceed the maximum cache size
        const recentSessions = sessions
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, this.config.maxCachedSessions);
        
        recentSessions.forEach(session => {
          this.sessionCache.set(session.id, session);
        });
        
        console.log(`📦 Loaded ${this.sessionCache.size} sessions from cache`);
      }
    } catch (error) {
      console.error('Failed to load session cache:', error);
      // Clear potentially corrupted cache
      localStorage.removeItem('clarimeet-session-cache');
    }
  }

  /**
   * Save session to cache
   */
  public cacheSession(session: Session): void {
    if (!this.config.cacheSessions) return;
    
    this.sessionCache.set(session.id, session);
    
    // Ensure we don't exceed the maximum cache size
    if (this.sessionCache.size > this.config.maxCachedSessions) {
      // Find the oldest session
      let oldestSessionId = '';
      let oldestTime = Date.now();
      
      this.sessionCache.forEach((cachedSession, id) => {
        const sessionTime = new Date(cachedSession.updatedAt).getTime();
        if (sessionTime < oldestTime) {
          oldestTime = sessionTime;
          oldestSessionId = id;
        }
      });
      
      // Remove the oldest session
      if (oldestSessionId) {
        this.sessionCache.delete(oldestSessionId);
      }
    }
    
    // Save cache to localStorage
    this.saveSessionCache();
  }

  /**
   * Get session from cache
   */
  public getCachedSession(sessionId: string): Session | undefined {
    return this.sessionCache.get(sessionId);
  }

  /**
   * Save current cache to localStorage
   */
  private saveSessionCache(): void {
    try {
      const sessionsArray = Array.from(this.sessionCache.values());
      localStorage.setItem('clarimeet-session-cache', JSON.stringify(sessionsArray));
    } catch (error) {
      console.error('Failed to save session cache:', error);
    }
  }

  /**
   * Clear the session cache
   */
  public clearCache(): void {
    this.sessionCache.clear();
    localStorage.removeItem('clarimeet-session-cache');
    console.log('🧹 Session cache cleared');
  }
}

// Export singleton instance
export const startupOptimizer = new StartupOptimizer();
export default startupOptimizer;
