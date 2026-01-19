#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 3456;
const DASHBOARD_URL = `http://localhost:${PORT}`;

// Check if server is already running
function checkServer() {
  return new Promise((resolve) => {
    http.get(DASHBOARD_URL + '/api/stats', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

// Start the server
function startServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  const server = spawn('node', [serverPath], {
    detached: true,
    stdio: 'ignore'
  });
  server.unref();
  return server;
}

// Open browser
function openBrowser(url) {
  const platform = process.platform;
  let cmd;

  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.log(`Dashboard running at: ${url}`);
    }
  });
}

// Wait for server to be ready
function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      checkServer().then((ready) => {
        if (ready) {
          resolve();
        } else if (attempts >= maxAttempts) {
          reject(new Error('Server failed to start'));
        } else {
          setTimeout(check, 200);
        }
      });
    };

    check();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const noBrowser = args.includes('--no-browser');

  console.log('Claude Code Dashboard');
  console.log('---------------------');

  const isRunning = await checkServer();

  if (isRunning) {
    console.log('Server already running');
  } else {
    console.log('Starting server...');
    startServer();

    try {
      await waitForServer();
      console.log('Server started');
    } catch (err) {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  }

  if (!noBrowser) {
    console.log('Opening dashboard...');
    openBrowser(DASHBOARD_URL);
  }

  console.log(`Dashboard: ${DASHBOARD_URL}`);
}

main();
