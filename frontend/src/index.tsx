import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './electron.css'; // Electron-specific styles
import App from './App';
import { BrowserRouter, HashRouter } from 'react-router-dom';
// Import WebSocket polyfill to fix connection issues
import './hooks/websocket-polyfill';
import startupOptimizer from './utils/startupOptimizer';

// Check if running in Electron
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') !== -1;

// Initialize startup optimizer before rendering
startupOptimizer.initialize().then(() => {
  console.log('✨ Clarimeet is ready to render');
  
  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );
  root.render(
    <StrictMode>
      {isElectron ? (
        <HashRouter>
          <App />
        </HashRouter>
      ) : (
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )}
    </StrictMode>
  );
});

// Report application load time
window.addEventListener('load', () => {
  const loadTime = performance.now();
  console.log(`📊 Application loaded in ${Math.round(loadTime)}ms`);
});
