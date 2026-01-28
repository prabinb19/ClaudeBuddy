#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const DASHBOARD_DIR = path.join(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);
  const useBrowser = args.includes('--browser');

  console.log('ClaudeBuddy');
  console.log('-----------');

  if (useBrowser) {
    // Legacy mode: open in browser
    console.log('Starting in browser mode...');
    const serverProcess = spawn('npm', ['run', 'start'], {
      cwd: DASHBOARD_DIR,
      stdio: 'inherit',
      shell: true
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
  } else {
    // Default: launch Electron app in dev mode
    console.log('Starting Electron app...');
    const electronProcess = spawn('npm', ['run', 'electron:dev-live'], {
      cwd: DASHBOARD_DIR,
      stdio: 'inherit',
      shell: true
    });

    electronProcess.on('error', (err) => {
      console.error('Failed to start Electron app:', err.message);
      process.exit(1);
    });
  }
}

main();
