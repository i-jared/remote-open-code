#!/usr/bin/env bun

import { stat } from 'node:fs/promises';
import { router } from './router';
import { opencodeManager } from './services/opencode-manager';
import { tailscaleService } from './services/tailscale-service';
import { folderService } from './services/folder-service';
import { parseArgs, showHelp, showVersion } from './utils/cli';
import { runDoctor, checkRequiredDependencies, getTailscaleHostname } from './utils/doctor';

// Parse CLI arguments
const args = process.argv.slice(2);
const options = parseArgs(args);

// Handle help/version/doctor flags
if (options.help) {
  showHelp();
  process.exit(0);
}

if (options.version) {
  showVersion();
  process.exit(0);
}

if (options.doctor) {
  const ok = await runDoctor();
  process.exit(ok ? 0 : 1);
}

// Check required dependencies
const depCheck = await checkRequiredDependencies();
if (!depCheck.ok) {
  console.error(`\n❌ Missing required dependencies: ${depCheck.missing.join(', ')}`);
  console.error('   Run "remote-open-code --doctor" for installation instructions.\n');
  process.exit(1);
}

// Verify directory exists
let dirStat;
try {
  dirStat = await stat(options.directory);
} catch {
  dirStat = null;
}

if (!dirStat?.isDirectory()) {
  console.error(`\n❌ Directory not found: ${options.directory}\n`);
  process.exit(1);
}

// Set base directory
folderService.setBaseDirectory(options.directory);

// Get Tailscale hostname for display
const tailscaleHostname = await getTailscaleHostname();

console.log(`
┌─────────────────────────────────────────────────┐
│       Remote OpenCode Project Manager           │
└─────────────────────────────────────────────────┘

📁 Base directory: ${options.directory}
🚀 Port: ${options.port}
${tailscaleHostname ? `🌐 Tailscale: ${tailscaleHostname}` : '⚠️  Tailscale: not connected (run "tailscale up")'}
`);

// Start the Bun HTTP server
const server = Bun.serve({
  port: options.port,
  async fetch(req) {
    try {
      return await router(req);
    } catch (error) {
      console.error('Request error:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      );
    }
  },
  // Graceful shutdown handler
  async onStop() {
    console.log('Shutting down server...');
    
    // Stop all OpenCode instances
    try {
      await opencodeManager.stopAll();
      console.log('All OpenCode instances stopped');
    } catch (error) {
      console.error('Error stopping OpenCode instances:', error);
    }

    // Stop all Tailscale serves
    try {
      await tailscaleService.stopAll();
      console.log('All Tailscale serves stopped');
    } catch (error) {
      console.error('Error stopping Tailscale serves:', error);
    }

    console.log('Server shutdown complete');
  },
});

console.log(`Server running at http://localhost:${options.port}`);
console.log(`API endpoints available at http://localhost:${options.port}/api`);
console.log(`\nPress Ctrl+C to stop the server.\n`);

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  server.stop();
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  server.stop();
});
