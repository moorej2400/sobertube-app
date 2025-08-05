/**
 * SoberTube Backend Server
 * Main entry point for the Node.js/TypeScript API server with WebSocket support
 */

import { createServer } from 'http';
import { app } from './app';
import { config } from './config';
import { WebSocketServer } from './websocket';
import { logger } from './utils/logger';

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket server
const wsServer = new WebSocketServer(httpServer);

// Start server
const server = httpServer.listen(config.port, () => {
  console.log(`SoberTube Backend Server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Health check: http://localhost:${config.port}/health`);
  console.log(`WebSocket server ready for connections`);
  
  logger.info('SoberTube server started', {
    component: 'Server',
    port: config.port,
    environment: config.nodeEnv,
    websocketEnabled: true
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close WebSocket server first
  wsServer.getIOServer().close(() => {
    console.log('WebSocket server closed');
    
    // Then close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close WebSocket server first
  wsServer.getIOServer().close(() => {
    console.log('WebSocket server closed');
    
    // Then close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});

export { app, server, wsServer };