import React, { useEffect, useState } from 'react';
import { useWebSocketBridge, WebSocketMessageType } from '../contexts/WebSocketContextBridge';
import { useAudio } from '../contexts/AudioContext';
import { useSession } from '../contexts/SessionContext';
import { ExclamationCircleIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

interface SystemStatus {
  websocket: 'connected' | 'disconnected' | 'connecting' | 'error';
  audio: 'available' | 'unavailable' | 'error' | 'recording';
  backend: 'online' | 'offline' | 'error';
  session: 'active' | 'inactive' | 'loading' | 'error';
}

const SystemHealthMonitor: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<SystemStatus>({
    websocket: 'disconnected',
    audio: 'unavailable',
    backend: 'offline',
    session: 'inactive',
  });
  
  const { connectionStatus: wsStatus, reconnect: reconnectWs } = useWebSocketBridge();
  const { devices, isRecording, refreshDevices } = useAudio();
  const { currentSession, isLoading: sessionLoading, error: sessionError } = useSession();
  
  // Check system health every 30 seconds
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const response = await fetch('http://localhost:8000/health');
        if (response.ok) {
          setStatus(prev => ({ ...prev, backend: 'online' }));
        } else {
          setStatus(prev => ({ ...prev, backend: 'error' }));
        }
      } catch (error) {
        setStatus(prev => ({ ...prev, backend: 'offline' }));
      }
    };
    
    // Initial check
    checkBackendHealth();
    
    // Set up interval
    const intervalId = setInterval(checkBackendHealth, 30000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Monitor WebSocket status
  useEffect(() => {
    setStatus(prev => ({ ...prev, websocket: wsStatus }));
  }, [wsStatus]);
  
  // Monitor audio device status
  useEffect(() => {
    if (devices.length > 0) {
      setStatus(prev => ({ 
        ...prev, 
        audio: isRecording ? 'recording' : 'available' 
      }));
    } else {
      setStatus(prev => ({ ...prev, audio: 'unavailable' }));
    }
  }, [devices, isRecording]);
  
  // Monitor session status
  useEffect(() => {
    if (sessionError) {
      setStatus(prev => ({ ...prev, session: 'error' }));
    } else if (sessionLoading) {
      setStatus(prev => ({ ...prev, session: 'loading' }));
    } else if (currentSession) {
      setStatus(prev => ({ ...prev, session: 'active' }));
    } else {
      setStatus(prev => ({ ...prev, session: 'inactive' }));
    }
  }, [currentSession, sessionLoading, sessionError]);

  // Calculate overall health
  const getOverallHealth = (): 'healthy' | 'warning' | 'error' => {
    if (
      status.websocket === 'error' ||
      status.audio === 'error' ||
      status.backend === 'error' ||
      status.backend === 'offline' ||
      status.session === 'error'
    ) {
      return 'error';
    }
    
    if (
      status.websocket === 'disconnected' ||
      status.audio === 'unavailable' ||
      status.websocket === 'connecting'
    ) {
      return 'warning';
    }
    
    return 'healthy';
  };
  
  const overallHealth = getOverallHealth();
  
  // Recovery actions
  const handleRecoveryAction = async (type: keyof SystemStatus) => {
    switch (type) {
      case 'websocket':
        reconnectWs();
        break;
      case 'audio':
        await refreshDevices();
        break;
      case 'backend':
        // Attempt to restart backend (this would depend on your electron bridge)
        // For now, we'll just refresh the health check
        setStatus(prev => ({ ...prev, backend: 'offline' }));
        try {
          const response = await fetch('http://localhost:8000/health');
          if (response.ok) {
            setStatus(prev => ({ ...prev, backend: 'online' }));
          } else {
            setStatus(prev => ({ ...prev, backend: 'error' }));
          }
        } catch (error) {
          setStatus(prev => ({ ...prev, backend: 'offline' }));
        }
        break;
      case 'session':
        // Refresh session data
        window.location.reload();
        break;
    }
  };
  
  // Only render the indicator button when collapsed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 rounded-full p-2 shadow-lg z-50 transition-colors ${
          overallHealth === 'healthy' ? 'bg-green-500 hover:bg-green-600' : 
          overallHealth === 'warning' ? 'bg-yellow-500 hover:bg-yellow-600' : 
          'bg-red-500 hover:bg-red-600'
        }`}
        title="System Health Status"
      >
        {overallHealth === 'healthy' ? (
          <CheckCircleIcon className="h-6 w-6 text-white" />
        ) : overallHealth === 'warning' ? (
          <ExclamationCircleIcon className="h-6 w-6 text-white" />
        ) : (
          <ExclamationCircleIcon className="h-6 w-6 text-white animate-pulse" />
        )}
      </button>
    );
  }

  // Full panel when open
  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 z-50 w-80">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-gray-900 dark:text-white">System Health</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="space-y-3">
        {/* WebSocket Status */}
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className={`h-3 w-3 rounded-full mr-2 ${
              status.websocket === 'connected' ? 'bg-green-500' : 
              status.websocket === 'connecting' ? 'bg-yellow-500' : 
              'bg-red-500'
            }`}></span>
            <span className="text-sm text-gray-700 dark:text-gray-300">WebSocket</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
              {status.websocket === 'connected' ? 'Connected' : 
               status.websocket === 'connecting' ? 'Connecting...' : 
               status.websocket === 'error' ? 'Error' : 'Disconnected'}
            </span>
            {status.websocket !== 'connected' && (
              <button 
                onClick={() => handleRecoveryAction('websocket')}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                title="Reconnect WebSocket"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* Audio Status */}
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className={`h-3 w-3 rounded-full mr-2 ${
              status.audio === 'recording' ? 'bg-green-500 animate-pulse' :
              status.audio === 'available' ? 'bg-green-500' : 
              'bg-red-500'
            }`}></span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Audio</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
              {status.audio === 'recording' ? 'Recording' : 
               status.audio === 'available' ? 'Available' : 
               status.audio === 'error' ? 'Error' : 'Unavailable'}
            </span>
            {status.audio !== 'recording' && status.audio !== 'available' && (
              <button 
                onClick={() => handleRecoveryAction('audio')}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                title="Refresh Audio Devices"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* Backend Status */}
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className={`h-3 w-3 rounded-full mr-2 ${
              status.backend === 'online' ? 'bg-green-500' : 'bg-red-500'
            }`}></span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Backend</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
              {status.backend === 'online' ? 'Online' : 
               status.backend === 'error' ? 'Error' : 'Offline'}
            </span>
            {status.backend !== 'online' && (
              <button 
                onClick={() => handleRecoveryAction('backend')}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                title="Check Backend Status"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* Session Status */}
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <span className={`h-3 w-3 rounded-full mr-2 ${
              status.session === 'active' ? 'bg-green-500' : 
              status.session === 'loading' ? 'bg-yellow-500' : 
              status.session === 'inactive' ? 'bg-gray-500' : 'bg-red-500'
            }`}></span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Session</span>
          </div>
          <div className="flex items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
              {status.session === 'active' ? 'Active' : 
               status.session === 'loading' ? 'Loading...' : 
               status.session === 'error' ? 'Error' : 'Inactive'}
            </span>
            {status.session === 'error' && (
              <button 
                onClick={() => handleRecoveryAction('session')}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                title="Refresh Session"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemHealthMonitor;
