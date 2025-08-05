/**
 * WebSocket Event Types and Interfaces
 * Defines all Socket.IO events, payloads, and authentication interfaces
 */

import { Socket } from 'socket.io';

// Socket data interface (moved up to avoid circular reference)
export interface SocketData {
  userId?: string;
  username?: string;
  isAuthenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
  roomsJoined: string[];
}

// Authentication interfaces
export interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  isAuthenticated: boolean;
}

export interface SocketAuthPayload {
  token: string;
}

export interface SocketUser {
  id: string;
  username: string;
  isOnline: boolean;
  lastSeen: Date;
}

// Connection management interfaces
export interface ConnectionInfo {
  socketId: string;
  userId: string;
  username: string;
  connectedAt: Date;
  lastActivity: Date;
}

// Social interaction event interfaces
export interface LikeEventPayload {
  postId: string;
  userId: string;
  username: string;
  isLiked: boolean;
  totalLikes: number;
}

export interface CommentEventPayload {
  commentId: string;
  postId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: Date;
  parentCommentId?: string;
}

export interface FollowEventPayload {
  followerId: string;
  followeeId: string;
  followerUsername: string;
  followeeUsername: string;
  isFollowing: boolean;
  totalFollowers: number;
}

// Feed update event interfaces
export interface FeedUpdatePayload {
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: Date;
  mediaUrl?: string;
  type: 'new_post' | 'trending' | 'recommended';
}

export interface UserPresencePayload {
  userId: string;
  username: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: Date;
}

// Error and notification interfaces
export interface SocketErrorPayload {
  code: string;
  message: string;
  details?: any;
}

export interface NotificationPayload {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'system';
  title: string;
  message: string;
  data?: any;
  createdAt: Date;
  isRead: boolean;
}

// Server-to-client events (redefining properly)
export interface ServerToClientEvents {
  // Social interaction events
  'post:liked': (payload: LikeEventPayload) => void;
  'post:unliked': (payload: LikeEventPayload) => void;
  'comment:created': (payload: CommentEventPayload) => void;
  'comment:updated': (payload: CommentEventPayload) => void;
  'comment:deleted': (payload: { commentId: string; postId: string }) => void;
  'user:followed': (payload: FollowEventPayload) => void;
  'user:unfollowed': (payload: FollowEventPayload) => void;
  
  // Feed and content events
  'feed:update': (payload: FeedUpdatePayload) => void;
  'feed:batch_update': (payload: FeedUpdatePayload[]) => void;
  
  // User presence events
  'user:online': (payload: UserPresencePayload) => void;
  'user:offline': (payload: UserPresencePayload) => void;
  'user:presence': (payload: UserPresencePayload) => void;
  
  // Notification events
  'notification:new': (payload: NotificationPayload) => void;
  'notification:updated': (payload: NotificationPayload) => void;
  
  // System events
  'error': (payload: SocketErrorPayload) => void;
  'authenticated': (payload: { userId: string; username: string }) => void;
  'unauthenticated': (payload: { reason: string }) => void;
}

// Client-to-server events
export interface ClientToServerEvents {
  // Authentication
  'authenticate': (payload: SocketAuthPayload) => void;
  'disconnect_user': () => void;
  
  // Social interactions
  'like_post': (payload: { postId: string }) => void;
  'unlike_post': (payload: { postId: string }) => void;
  'create_comment': (payload: { postId: string; content: string; parentCommentId?: string }) => void;
  'follow_user': (payload: { userId: string }) => void;
  'unfollow_user': (payload: { userId: string }) => void;
  
  // Feed interactions
  'join_feed': () => void;
  'leave_feed': () => void;
  'request_feed_update': () => void;
  
  // Presence management
  'update_presence': (payload: { status: 'online' | 'away' }) => void;
  'request_user_presence': (payload: { userIds: string[] }) => void;
  
  // Notification management
  'mark_notification_read': (payload: { notificationId: string }) => void;
  'get_unread_notifications': () => void;
}

// Socket.IO server event data
export interface InterServerEvents {
  // Cross-server communication for scaling
  'user_connected': (payload: { userId: string; socketId: string }) => void;
  'user_disconnected': (payload: { userId: string; socketId: string }) => void;
  'broadcast_to_user': (payload: { userId: string; event: string; data: any }) => void;
}



// Rate limiting interfaces
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message: string;
}

export interface UserRateLimit {
  [userId: string]: {
    requests: number;
    resetTime: number;
  };
}

// WebSocket server configuration
export interface WebSocketConfig {
  cors: {
    origin: string | boolean;
    credentials: boolean;
  };
  pingTimeout: number;
  pingInterval: number;
  maxHttpBufferSize: number;
  transports: string[];
  allowEIO3: boolean;
}

// Room management
export interface RoomInfo {
  name: string;
  type: 'user' | 'post' | 'feed' | 'global';
  users: Set<string>;
  createdAt: Date;
  lastActivity: Date;
}

// Event validation schemas (for runtime type checking)
export interface EventValidationSchema {
  [eventName: string]: {
    required: string[];
    optional?: string[];
    types: { [key: string]: string };
  };
}