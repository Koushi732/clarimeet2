const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut } = require('electron');
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
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false, // Hide until ready-to-show
    icon: path.join(__dirname, 'public', 'favicon.ico')
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

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  
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
  if (miniWindow) {
    miniWindow.show();
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
  if (statusWindow) {
    statusWindow.show();
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
    mainWindow.focus();
  }
});

ipcMain.on('hide-main-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
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
  if (enhancedMiniWindow) {
    enhancedMiniWindow.show();
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

// Handle window activation
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
