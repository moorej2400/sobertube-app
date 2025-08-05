/**
 * WebSocket Module Exports
 * Central export point for all WebSocket-related functionality
 */

export { WebSocketServer } from './server';
export * from './types';

// Re-export commonly used Socket.IO types
export { Socket, Server as SocketIOServer } from 'socket.io';