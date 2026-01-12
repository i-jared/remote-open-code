import { router } from './router';
import { opencodeManager } from './services/opencode-manager';
import { tailscaleService } from './services/tailscale-service';
import { folderService } from './services/folder-service';

// Get base directory from environment or use current working directory
const BASE_DIRECTORY = process.env.BASE_DIRECTORY || process.cwd();
folderService.setBaseDirectory(BASE_DIRECTORY);

const PORT = parseInt(process.env.PORT || '3000', 10);

console.log(`Starting Project Manager Server...`);
console.log(`Base directory: ${BASE_DIRECTORY}`);
console.log(`Port: ${PORT}`);

// Start the Bun HTTP server
const server = Bun.serve({
  port: PORT,
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

console.log(`Server running at http://localhost:${PORT}`);
console.log(`API endpoints available at http://localhost:${PORT}/api`);

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  server.stop();
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  server.stop();
});
