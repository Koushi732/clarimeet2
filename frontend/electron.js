const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, desktopCapturer } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const isDev = require('electron-is-dev');
const url = require('url');

// Keep global references to prevent garbage collection
let mainWindow;
let tray;
let miniWindow;
let statusWindow;
let enhancedMiniWindow;

function createMainWindow() {
  // Create the browser window with enhanced security and performance settings
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,  // Enhanced security with sandbox
      spellcheck: true, // Enable spellcheck for text inputs
      devTools: isDev, // Only enable DevTools in development
    },
    show: false, // Hide until ready-to-show
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    backgroundColor: '#f5f5f5', // Smooth initial loading experience
    titleBarStyle: 'hiddenInset' // Modern title bar look
  });

  // Load the app
  const startUrl = isDev
    ? 'http://localhost:3000' // Dev server
    : url.format({
        pathname: path.join(__dirname, './build/index.html'),
        protocol: 'file:',
        slashes: true
      }); // Production build
  
  console.log('Loading URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open the DevTools automatically in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
  
  return mainWindow;
}

// App is ready event handler
function createTray() {
  const iconPath = path.join(__dirname, 'public', 'favicon.ico');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open Clarimeet', 
      click: () => mainWindow.show() 
    },
    {
      label: 'Show Mini Tab',
      click: () => createMiniTab()
    },
    {
      label: 'Show Enhanced Mini Tab',
      click: () => createEnhancedMiniTab()
    },
    {
      label: 'Show Status Panel',
      click: () => createStatusPanel()
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => app.quit() 
    }
  ]);
  
  tray.setToolTip('Clarimeet - AI Meeting Companion');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

// Audio recording variables
let audioRecorder = null;
let audioContext = null;
let audioInputStream = null;
let audioAnalyser = null;
let audioDataArray = null;
let isRecording = false;
let recordingSessionId = null;
let audioLevelInterval = null;
let recordingStream = null;
let audioTrack = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingFilePath = null;
let selectedDeviceId = null;

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  
  // Set up audio device handler
  setupAudioHandlers();
  
  // Register global shortcuts
  const registerShortcuts = () => {
    // Clear any existing shortcuts first
    globalShortcut.unregisterAll();
    
    // Register global shortcut for toggling recording
    globalShortcut.register('CommandOrControl+Shift+R', () => {
      if (mainWindow) {
        mainWindow.webContents.send('global-shortcut', 'toggle-recording');
      }
    });
    
    // Register global shortcut for toggling mini tab
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      if (mainWindow) {
        mainWindow.webContents.send('global-shortcut', 'toggle-mini-tab');
      }
    });
    
    // Register global shortcut for toggling enhanced mini tab
    globalShortcut.register('CommandOrControl+Shift+E', () => {
      if (mainWindow) {
        mainWindow.webContents.send('global-shortcut', 'toggle-enhanced-mini-tab');
      }
    });
    
    // Register global shortcut for toggling status panel
    globalShortcut.register('CommandOrControl+Shift+S', () => {
      if (mainWindow) {
        mainWindow.webContents.send('global-shortcut', 'toggle-status-panel');
      }
    });
  };
  
  registerShortcuts();
  
  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Create floating MiniTab window
function createMiniTab(bounds) {
  // Close other floating windows first to ensure only one is shown
  if (enhancedMiniWindow) {
    enhancedMiniWindow.close();
    enhancedMiniWindow = null;
  }
  
  if (statusWindow) {
    statusWindow.close();
    statusWindow = null;
  }
  
  // Toggle miniWindow if it already exists
  if (miniWindow) {
    miniWindow.close();
    miniWindow = null;
    return;
  }
  
  const { width, height } = bounds || { width: 300, height: 200 };
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  
  miniWindow = new BrowserWindow({
    width: width || 300,
    height: height || 200,
    x: bounds ? bounds.x : screenWidth - 350,
    y: bounds ? bounds.y : 50,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  const miniTabUrl = isDev
    ? 'http://localhost:3000/#/mini-tab'
    : url.format({
        pathname: path.join(__dirname, './build/index.html'),
        protocol: 'file:',
        slashes: true,
        hash: '/mini-tab'
      });
  
  miniWindow.loadURL(miniTabUrl);
  
  miniWindow.on('closed', () => {
    miniWindow = null;
  });
  
  if (isDev) {
    miniWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Create floating Status Panel window
function createStatusPanel(bounds) {
  // Close other floating windows first to ensure only one is shown
  if (miniWindow) {
    miniWindow.close();
    miniWindow = null;
  }
  
  if (enhancedMiniWindow) {
    enhancedMiniWindow.close();
    enhancedMiniWindow = null;
  }
  
  // Toggle statusWindow if it already exists
  if (statusWindow) {
    statusWindow.close();
    statusWindow = null;
    return;
  }
  
  const { width, height } = bounds || { width: 400, height: 300 };
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  
  statusWindow = new BrowserWindow({
    width: width || 400,
    height: height || 300,
    x: bounds ? bounds.x : screenWidth - 450,
    y: bounds ? bounds.y : screenHeight - 350,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  const statusPanelUrl = isDev
    ? 'http://localhost:3000/#/status-panel'
    : url.format({
        pathname: path.join(__dirname, './build/index.html'),
        protocol: 'file:',
        slashes: true,
        hash: '/status-panel'
      });
  
  statusWindow.loadURL(statusPanelUrl);
  
  statusWindow.on('closed', () => {
    statusWindow = null;
  });
  
  if (isDev) {
    statusWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Set up IPC handlers
ipcMain.on('show-main-window', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

ipcMain.on('hide-main-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

// Handle WebSocket-like messages
ipcMain.on('websocket-message-send', (event, message) => {
  // Process the message based on type
  console.log('Received WebSocket message:', message);
  
  if (message.type === 'start_recording') {
    // Handle start recording request
    const deviceId = message.data?.deviceId;
    const options = message.data?.options || {};
    
    if (deviceId) {
      // We're in the main process, so use direct IPC call to the handler
      event.sender.invoke('start-audio-recording', deviceId, options)
        .then(sessionId => {
          // Send success response
          BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('websocket-message', {
                type: 'session_update',
                data: {
                  sessionId: sessionId,
                  status: 'recording',
                  message: 'Recording started successfully'
                }
              });
            }
          });
        })
        .catch(error => {
          // Send error response
          BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('websocket-message', {
                type: 'error',
                data: {
                  message: `Failed to start recording: ${error.message}`
                }
              });
            }
          });
        });
    }
  }
  else if (message.type === 'stop_recording') {
    // Handle stop recording request
    event.sender.invoke('stop-audio-recording')
      .then(result => {
        // Send success response
        BrowserWindow.getAllWindows().forEach(win => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('websocket-message', {
              type: 'session_update',
              data: {
                sessionId: result.sessionId,
                status: 'completed',
                message: 'Recording stopped successfully',
                filePath: result.filePath
              }
            });
          }
        });
      })
      .catch(error => {
        // Send error response
        BrowserWindow.getAllWindows().forEach(win => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('websocket-message', {
              type: 'error',
              data: {
                message: `Failed to stop recording: ${error.message}`
              }
            });
          }
        });
      });
  }
  // Add other message types as needed
});

// Handler to get WebSocket status
ipcMain.handle('get-websocket-status', () => {
  return {
    isConnected: true, // Always report as connected in Electron
    url: null
  };
});

ipcMain.on('create-mini-tab', (event, bounds) => {
  createMiniTab(bounds);
});

ipcMain.on('create-status-panel', (event, bounds) => {
  createStatusPanel(bounds);
});

ipcMain.on('update-mini-tab-position', (event, bounds) => {
  if (miniWindow) {
    miniWindow.setBounds(bounds);
  }
});

ipcMain.on('update-status-panel-position', (event, bounds) => {
  if (statusWindow) {
    statusWindow.setBounds(bounds);
  }
});

ipcMain.on('create-enhanced-mini-tab', (event, bounds) => {
  createEnhancedMiniTab(bounds);
});

ipcMain.on('update-enhanced-mini-tab-position', (event, bounds) => {
  if (enhancedMiniWindow) {
    enhancedMiniWindow.setBounds(bounds);
  }
});

ipcMain.on('close-enhanced-mini-tab', () => {
  if (enhancedMiniWindow) {
    enhancedMiniWindow.close();
    enhancedMiniWindow = null;
  }
});

// Create enhanced floating MiniTab window
function createEnhancedMiniTab(bounds) {
  // Close other floating windows first to ensure only one is shown
  if (miniWindow) {
    miniWindow.close();
    miniWindow = null;
  }
  
  if (statusWindow) {
    statusWindow.close();
    statusWindow = null;
  }
  
  // Toggle enhancedMiniWindow if it already exists
  if (enhancedMiniWindow) {
    enhancedMiniWindow.close();
    enhancedMiniWindow = null;
    return;
  }
  
  const { width, height } = bounds || { width: 320, height: 420 };
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  
  enhancedMiniWindow = new BrowserWindow({
    width: width || 320,
    height: height || 420,
    x: bounds ? bounds.x : screenWidth - 370,
    y: bounds ? bounds.y : 100,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  const enhancedMiniTabUrl = isDev
    ? 'http://localhost:3000/#/enhanced-mini-tab'
    : url.format({
        pathname: path.join(__dirname, './build/index.html'),
        protocol: 'file:',
        slashes: true,
        hash: '/enhanced-mini-tab'
      });
  
  enhancedMiniWindow.loadURL(enhancedMiniTabUrl);
  
  enhancedMiniWindow.on('closed', () => {
    enhancedMiniWindow = null;
  });
  
  if (isDev) {
    enhancedMiniWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Set up audio device handlers
function setupAudioHandlers() {
  // Get available audio devices
  ipcMain.handle('get-audio-devices', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['audio', 'screen'] });
      
      // Format devices to match our AudioDevice interface
      const devices = sources.map(source => ({
        id: source.id,
        name: source.name,
        isInput: source.id.includes('input') || source.id.includes('microphone'),
        isOutput: source.id.includes('output') || source.id.includes('speaker'),
        isLoopback: source.id.includes('screen'),
        isDefault: source.name.toLowerCase().includes('default')
      }));
      
      return devices;
    } catch (error) {
      console.error('Error getting audio devices:', error);
      throw error;
    }
  });
  
  // Start audio recording
  ipcMain.handle('start-audio-recording', async (event, deviceId, options) => {
    try {
      // Generate a unique session ID
      recordingSessionId = Date.now().toString();
      selectedDeviceId = deviceId;
      isRecording = true;
      
      // Create directory for recordings if it doesn't exist
      const recordingsDir = path.join(os.homedir(), 'Clarimeet', 'Recordings');
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }
      
      // Generate file path for recording
      recordingFilePath = path.join(recordingsDir, `recording_${recordingSessionId}.webm`);
      
      // Start the actual recording
      console.log(`Starting recording with device: ${deviceId}`);
      recordedChunks = [];
      
      // Get the media stream based on the device type
      let constraints;
      
      if (deviceId.includes('screen')) {
        // For system audio (loopback)
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        const source = sources.find(s => s.id === deviceId);
        
        if (!source) {
          throw new Error('Screen source not found');
        }
        
        recordingStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop'
            }
          },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1280,
              minHeight: 720,
              maxHeight: 720
            }
          }
        });
      } else {
        // For microphone input
        constraints = {
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        };
        
        try {
          recordingStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          console.error('Failed to get user media, falling back to default device', err);
          // Fallback to default device
          recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
      }
      
      // Set up audio analyzer for levels
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      audioInputStream = audioContext.createMediaStreamSource(recordingStream);
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 256;
      audioInputStream.connect(audioAnalyser);
      audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
      
      // Create MediaRecorder
      mediaRecorder = new MediaRecorder(recordingStream, { mimeType: 'audio/webm' });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Save the recording
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(recordingFilePath, buffer);
        
        console.log(`Recording saved to: ${recordingFilePath}`);
        
        // Stop all tracks
        if (recordingStream) {
          recordingStream.getTracks().forEach(track => track.stop());
          recordingStream = null;
        }
        
        // Send status update with file path
        BrowserWindow.getAllWindows().forEach(win => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('recording-completed', {
              sessionId: recordingSessionId,
              filePath: recordingFilePath
            });
          }
        });
      };
      
      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      
      // Send status update to all windows
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('recording-status-update', {
            isRecording: true,
            sessionId: recordingSessionId,
            startTime: new Date().toISOString(),
            duration: 0,
            audioLevel: 0,
            deviceId: selectedDeviceId,
            errorMessage: null
          });
        }
      });
      
      // Start audio level monitoring
      startAudioLevelMonitoring();
      
      return recordingSessionId;
    } catch (error) {
      console.error('Error starting audio recording:', error);
      isRecording = false;
      
      // Send error status to all windows
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('recording-status-update', {
            isRecording: false,
            sessionId: recordingSessionId,
            errorMessage: error.message || 'Failed to start recording'
          });
        }
      });
      
      throw error;
    }
  });
  
  // Stop audio recording
  ipcMain.handle('stop-audio-recording', async () => {
    try {
      isRecording = false;
      const sessionId = recordingSessionId;
      
      // Stop media recorder if it exists
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      
      // Stop all tracks
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
      }
      
      // Clean up audio context resources
      if (audioContext && audioContext.state !== 'closed') {
        await audioContext.close();
        audioContext = null;
        audioInputStream = null;
        audioAnalyser = null;
        audioDataArray = null;
      }
      
      // Stop audio level monitoring
      if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
        audioLevelInterval = null;
      }
      
      // Send status update to all windows
      BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('recording-status-update', {
            isRecording: false,
            sessionId: null,
            startTime: null,
            duration: 0,
            audioLevel: 0,
            errorMessage: null
          });
        }
      });
      
      return {
        success: true,
        sessionId: sessionId,
        filePath: recordingFilePath
      };
    } catch (error) {
      console.error('Error stopping audio recording:', error);
      throw error;
    }
  });
  
  // Get current audio level
  ipcMain.handle('get-audio-level', () => {
    // If we're recording and have an analyzer, get the actual audio level
    if (isRecording && audioAnalyser && audioDataArray) {
      audioAnalyser.getByteFrequencyData(audioDataArray);
      
      // Calculate average volume level from frequency data
      let sum = 0;
      for (let i = 0; i < audioDataArray.length; i++) {
        sum += audioDataArray[i];
      }
      const average = sum / audioDataArray.length;
      
      // Normalize to 0-1 range (audio data is 0-255)
      return average / 255;
    }
    return 0;
  });
  
  // Add handler to get recording file path
  ipcMain.handle('get-recording-file-path', () => {
    return recordingFilePath;
  });
}

// Start monitoring audio levels
function startAudioLevelMonitoring() {
  if (audioLevelInterval) {
    clearInterval(audioLevelInterval);
  }
  
  let duration = 0;
  
  audioLevelInterval = setInterval(() => {
    if (!isRecording) {
      clearInterval(audioLevelInterval);
      audioLevelInterval = null;
      return;
    }
    
    // Increment duration (in seconds)
    duration += 1;
    
    // Get actual audio level from analyzer
    let audioLevel = 0;
    if (audioAnalyser && audioDataArray) {
      audioAnalyser.getByteFrequencyData(audioDataArray);
      
      // Calculate average volume level from frequency data
      let sum = 0;
      for (let i = 0; i < audioDataArray.length; i++) {
        sum += audioDataArray[i];
      }
      const average = sum / audioDataArray.length;
      
      // Normalize to 0-1 range (audio data is 0-255)
      audioLevel = average / 255;
    } else {
      // Fallback if analyzer not available
      audioLevel = Math.random() * 0.2 + 0.05; // Low random value
    }
    
    // Send update to all windows
    BrowserWindow.getAllWindows().forEach(win => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('audio-level-update', audioLevel);
        win.webContents.send('recording-status-update', {
          isRecording: true,
          sessionId: recordingSessionId,
          startTime: new Date(Date.now() - duration * 1000).toISOString(),
          duration: duration,
          audioLevel: audioLevel,
          deviceId: selectedDeviceId,
          errorMessage: null
        });
      }
    });
    
    // Also send a WebSocket-like update for the UI to consume
    BrowserWindow.getAllWindows().forEach(win => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('websocket-message', {
          type: 'audio_status',
          data: {
            sessionId: recordingSessionId,
            isRecording: true,
            audioLevel: audioLevel,
            duration: duration,
            timestamp: Date.now() / 1000
          }
        });
      }
    });
  }, 200); // Update more frequently (5 times per second) for responsive UI
}

// Handle window activation
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
