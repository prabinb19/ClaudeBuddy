const { Tray, Menu, nativeImage, app, shell } = require('electron');
const path = require('path');

let tray = null;

/**
 * Create the system tray icon and context menu
 * @param {Function} toggleWindow - Function to toggle window visibility
 * @param {Function} getMainWindow - Function to get the main window instance
 * @returns {Tray} The created tray instance
 */
function createTray(toggleWindow, getMainWindow) {
  // Get icon path and create tray
  const iconPath = getIconPath();
  const icon = createTrayIcon(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('ClaudeBuddy');

  // macOS and other platforms
  if (process.platform === 'darwin') {
    // On macOS, use a context menu that appears on click
    const contextMenu = buildContextMenu(toggleWindow, getMainWindow);
    tray.setContextMenu(contextMenu);
  } else {
    // Windows/Linux: Standard click handling
    tray.on('click', (event, bounds) => {
      console.log('Tray clicked! Bounds:', bounds);
      toggleWindow();
    });

    tray.on('double-click', () => {
      console.log('Tray double-clicked');
      toggleWindow();
    });

    tray.on('right-click', () => {
      console.log('Tray right-clicked');
      const contextMenu = buildContextMenu(toggleWindow, getMainWindow);
      tray.popUpContextMenu(contextMenu);
    });
  }

  return tray;
}

/**
 * Get the appropriate icon path based on environment
 */
function getIconPath() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // Development: use local assets
    return path.join(__dirname, '..', 'assets', 'claudebuddy-icon.png');
  } else {
    // Production: use bundled assets
    return path.join(process.resourcesPath, 'assets', 'claudebuddy-icon.png');
  }
}

/**
 * Create a tray icon from the given path
 * Falls back to a template icon if file doesn't exist
 */
function createTrayIcon(iconPath) {
  let icon;

  try {
    // Try to load the icon from file
    icon = nativeImage.createFromPath(iconPath);

    // If icon is empty, create a fallback
    if (icon.isEmpty()) {
      icon = createFallbackIcon();
    }
  } catch (error) {
    console.warn('Failed to load tray icon, using fallback:', error.message);
    icon = createFallbackIcon();
  }

  // Resize for menu bar
  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 18, height: 18 });
    // NOTE: Not using setTemplateImage to ensure click events work
  }

  return icon;
}

/**
 * Create a fallback icon when the main icon can't be loaded
 * This creates a simple colored square icon
 */
function createFallbackIcon() {
  // Create a simple 16x16 icon (orange square for ClaudeBuddy)
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  // Fill with orange color (#f5a623)
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    canvas[offset] = 0xf5;     // R
    canvas[offset + 1] = 0xa6; // G
    canvas[offset + 2] = 0x23; // B
    canvas[offset + 3] = 0xff; // A
  }

  return nativeImage.createFromBuffer(canvas, {
    width: size,
    height: size,
  });
}

/**
 * Build the context menu for the tray
 */
function buildContextMenu(toggleWindow, getMainWindow) {
  const mainWindow = getMainWindow();
  const isVisible = mainWindow && mainWindow.isVisible();

  return Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide ClaudeBuddy' : 'Show ClaudeBuddy',
      click: () => {
        toggleWindow();
        // Update the menu after toggle
        if (tray) {
          setTimeout(() => {
            const newMenu = buildContextMenu(toggleWindow, getMainWindow);
            tray.setContextMenu(newMenu);
          }, 100);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => {
        shell.openExternal('http://localhost:3456');
      },
    },
    { type: 'separator' },
    {
      label: 'About',
      click: () => {
        const version = app.getVersion();
        const { dialog } = require('electron');
        dialog.showMessageBox({
          type: 'info',
          title: 'About ClaudeBuddy',
          message: 'ClaudeBuddy',
          detail: `Version ${version}\n\nYour friendly companion dashboard for Claude Code.\n\nMade with love for Claude Code users.`,
          buttons: ['OK'],
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit ClaudeBuddy',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

/**
 * Get the tray instance
 */
function getTray() {
  return tray;
}

/**
 * Destroy the tray
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  createTray,
  getTray,
  destroyTray,
  buildContextMenu,
};
