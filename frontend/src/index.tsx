import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './electron.css'; // Electron-specific styles
import App from './App';
import { BrowserRouter, HashRouter } from 'react-router-dom';
// Import WebSocket polyfill to fix connection issues
import './hooks/websocket-polyfill';
// Check if running in Electron
const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') !== -1;

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
