import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { isElectron, onGlobalShortcut, onToggleMiniTab, onToggleStatusPanel, onToggleEnhancedMiniTab, createMiniTab, createStatusPanel, createEnhancedMiniTab, closeEnhancedMiniTab } from './utils/electronBridge';

// Import layouts
import MainLayout from './layouts/MainLayout';

// Import pages
import HomePage from './pages/HomePage';
import LivePage from './pages/LivePage';
import UploadPage from './pages/UploadPage';
import SummaryPage from './pages/SummaryPage';
import SessionsPage from './pages/SessionsPage';
import SessionDetailPage from './pages/SessionDetailPage';
import SettingsPage from './pages/SettingsPage';
import MiniTabPage from './pages/MiniTabPage';
import StatusPanelPage from './pages/StatusPanelPage';
import EnhancedMiniTabPage from './pages/EnhancedMiniTabPage';

// Import floating components
import MiniTab from './components/floating/MiniTab';
import StatusPanel from './components/floating/StatusPanel';

// Import contexts
import { AudioProvider } from './contexts/AudioContext';
import { SessionProvider } from './contexts/SessionContext';
import WebSocketWrapper from './contexts/WebSocketWrapper';
import { SettingsProvider } from './contexts/SettingsContext';
import ErrorBoundary from './components/ErrorBoundary';
import SystemHealthMonitor from './components/SystemHealthMonitor';

function App() {
  const { theme } = useTheme();
  const [showMiniTab, setShowMiniTab] = useState(false);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [showEnhancedMiniTab, setShowEnhancedMiniTab] = useState(false);
  
  // Set theme class on document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);
  
  // Handle Electron-specific functionality
  useEffect(() => {
    if (isElectron()) {
      // Listen for global shortcuts
      const removeGlobalShortcutListener = onGlobalShortcut((command) => {
        if (command === 'toggle-recording') {
          // Handle recording toggle
          console.log('Toggle recording shortcut pressed');
        } else if (command === 'toggle-mini-tab') {
          setShowMiniTab(prev => !prev);
        } else if (command === 'toggle-enhanced-mini-tab') {
          setShowEnhancedMiniTab(prev => !prev);
          
          // Create or close the enhanced mini tab window
          if (!showEnhancedMiniTab) {
            createEnhancedMiniTab();
          } else {
            closeEnhancedMiniTab();
          }
        }
      });
      
      // Listen for mini tab toggle
      const removeMiniTabListener = onToggleMiniTab(() => {
        setShowMiniTab(prev => !prev);
      });
      
      // Listen for enhanced mini tab toggle
      const removeEnhancedMiniTabListener = onToggleEnhancedMiniTab(() => {
        setShowEnhancedMiniTab(prev => !prev);
        
        // Create or close the enhanced mini tab window
        if (!showEnhancedMiniTab) {
          createEnhancedMiniTab();
        } else {
          closeEnhancedMiniTab();
        }
      });
      
      // Listen for status panel toggle
      const removeStatusPanelListener = onToggleStatusPanel(() => {
        setShowStatusPanel(prev => !prev);
      });
      
      return () => {
        removeGlobalShortcutListener();
        removeMiniTabListener();
        removeEnhancedMiniTabListener();
        removeStatusPanelListener();
      };
    }
  }, [showEnhancedMiniTab]);

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <WebSocketWrapper>
          <AudioProvider>
            <SessionProvider>
            {/* Check if we're in a floating window route or main app */}
            <Routes>
              {/* Routes for standalone Electron windows */}
              <Route path="/mini-tab" element={<MiniTabPage />} />
              <Route path="/status-panel" element={<StatusPanelPage />} />
              <Route path="/enhanced-mini-tab" element={<EnhancedMiniTabPage />} />
              
              {/* Main application routes */}
              <Route path="*" element={
                <>
                  {/* Floating components for browser or in-app mode */}
                  {!isElectron() || showMiniTab ? <MiniTab /> : null}
                  {!isElectron() || showStatusPanel ? <StatusPanel /> : null}
                </>
              } />
              
              {/* Main routing */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/live" element={<LivePage />} />
                <Route path="/summary" element={<SummaryPage />} />
                <Route path="/summary/:sessionId" element={<SummaryPage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/sessions" element={<SessionsPage />} />
                <Route path="/mini-tab" element={<MiniTabPage />} />
                <Route path="/status-panel" element={<StatusPanelPage />} />
                <Route path="/enhanced-mini-tab" element={<EnhancedMiniTabPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            {/* System Health Monitor */}
            <SystemHealthMonitor />
          </SessionProvider>
        </AudioProvider>
      </WebSocketWrapper>
    </SettingsProvider>
    </ErrorBoundary>
  );
}

export default App;
