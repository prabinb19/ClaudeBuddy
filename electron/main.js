const { app, BrowserWindow, ipcMain, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Import tray management
const { createTray, getTray, getContextMenu } = require('./tray');

// Keep global references to prevent garbage collection
let mainWindow = null;
let pythonProcess = null;
let tray = null;

// Configuration
// Use Vite dev server only when VITE_DEV_SERVER env is set
const useViteDevServer = process.env.VITE_DEV_SERVER === 'true';
const isDev = !app.isPackaged;
const SERVER_PORT = 3456;
const SERVER_HOST = '127.0.0.1';

/**
 * Create the main browser window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    frame: false,
    resizable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#1a1a1a',
    minWidth: 600,
    minHeight: 400,
    maxWidth: 1200,
    maxHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Hide window when it loses focus
  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });

  // Prevent window from being closed, just hide it
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  // Load the app
  loadApp();

  return mainWindow;
}

/**
 * Load the React app into the window
 */
function loadApp() {
  if (useViteDevServer) {
    // Development with hot reload: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // Load from built files
    const indexPath = path.join(__dirname, '..', 'client', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }
}

/**
 * Start the Python FastAPI server
 */
function startPythonServer() {
  return new Promise((resolve, reject) => {
    const serverDir = isDev
      ? path.join(__dirname, '..', 'server')
      : path.join(process.resourcesPath, 'server');

    const pythonPath = isDev
      ? path.join(serverDir, 'venv', 'bin', 'python')
      : 'python3';

    console.log('Starting Python server from:', serverDir);
    console.log('Using Python:', pythonPath);

    // Spawn the Python process
    pythonProcess = spawn(pythonPath, [
      '-m', 'uvicorn',
      'app.main:app',
      '--host', SERVER_HOST,
      '--port', SERVER_PORT.toString(),
    ], {
      cwd: serverDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python Server] ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python Server] ${data}`);
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python server:', error);
      reject(error);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python server exited with code ${code}`);
      pythonProcess = null;
    });

    // Wait for server to be ready
    waitForServer(resolve, reject);
  });
}

/**
 * Poll the server health endpoint until it's ready
 */
function waitForServer(resolve, reject, attempts = 0) {
  const maxAttempts = 30;
  const retryDelay = 500;

  if (attempts >= maxAttempts) {
    reject(new Error('Server failed to start within timeout'));
    return;
  }

  const options = {
    hostname: SERVER_HOST,
    port: SERVER_PORT,
    path: '/api/health',
    method: 'GET',
    timeout: 1000,
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log('Python server is ready!');
      resolve();
    } else {
      setTimeout(() => waitForServer(resolve, reject, attempts + 1), retryDelay);
    }
  });

  req.on('error', () => {
    setTimeout(() => waitForServer(resolve, reject, attempts + 1), retryDelay);
  });

  req.on('timeout', () => {
    req.destroy();
    setTimeout(() => waitForServer(resolve, reject, attempts + 1), retryDelay);
  });

  req.end();
}

/**
 * Stop the Python server gracefully
 */
function stopPythonServer() {
  if (pythonProcess) {
    console.log('Stopping Python server...');
    pythonProcess.kill('SIGTERM');

    // Force kill after timeout
    setTimeout(() => {
      if (pythonProcess) {
        console.log('Force killing Python server...');
        pythonProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

/**
 * Position the window below the tray icon (or top-right on macOS)
 */
function positionWindowBelowTray() {
  if (!mainWindow) return;

  const { screen } = require('electron');
  const windowBounds = mainWindow.getBounds();
  const primaryDisplay = screen.getPrimaryDisplay();
  const displayBounds = primaryDisplay.workArea;

  let x, y;

  // On macOS, tray.getBounds() often returns zeros, so position top-right
  if (tray) {
    const trayBounds = tray.getBounds();

    if (trayBounds.x > 0 && trayBounds.width > 0) {
      // Tray bounds available - position below tray
      x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
      y = Math.round(trayBounds.y + trayBounds.height + 4);
    } else {
      // Tray bounds not available (common on macOS) - position top-right
      x = displayBounds.x + displayBounds.width - windowBounds.width - 10;
      y = displayBounds.y + 10;
    }
  } else {
    // No tray - position top-right
    x = displayBounds.x + displayBounds.width - windowBounds.width - 10;
    y = displayBounds.y + 10;
  }

  // Ensure window stays on screen
  if (x < displayBounds.x) {
    x = displayBounds.x;
  } else if (x + windowBounds.width > displayBounds.x + displayBounds.width) {
    x = displayBounds.x + displayBounds.width - windowBounds.width;
  }

  if (y + windowBounds.height > displayBounds.y + displayBounds.height) {
    y = displayBounds.y + displayBounds.height - windowBounds.height - 10;
  }

  mainWindow.setPosition(x, y, false);
}

/**
 * Toggle window visibility
 */
function toggleWindow() {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindowBelowTray();
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * Get the main window instance
 */
function getMainWindow() {
  return mainWindow;
}

// App lifecycle events
app.whenReady().then(async () => {
  try {
    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
      const iconPath = isDev
        ? path.join(__dirname, '..', 'assets', 'claudebuddy-icon.png')
        : path.join(process.resourcesPath, 'assets', 'claudebuddy-icon.png');
      const dockIcon = nativeImage.createFromPath(iconPath);
      app.dock.setIcon(dockIcon);
    }

    // Start Python server first
    await startPythonServer();

    // Create window
    createWindow();

    // Create tray icon
    tray = createTray(toggleWindow, getMainWindow);

    // Register global shortcut (Cmd+Shift+B) to toggle window
    globalShortcut.register('CommandOrControl+Shift+B', () => {
      toggleWindow();
    });

    console.log('ClaudeBuddy is ready! Press Cmd+Shift+B or click tray icon.');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // When clicking the Dock icon, show the window
  if (mainWindow) {
    positionWindowBelowTray();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// Handle app quit
app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  stopPythonServer();
});

// IPC handlers
ipcMain.handle('hide-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Export for use in other modules
module.exports = {
  getMainWindow,
  toggleWindow,
  positionWindowBelowTray,
};
