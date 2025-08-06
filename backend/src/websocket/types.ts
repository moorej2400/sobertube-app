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
  priority?: 'low' | 'normal' | 'high';
  personalizedScore?: number;
  postType?: string;
}

export interface BatchFeedUpdatePayload {
  updates: FeedUpdatePayload[];
  batchId: string;
  timestamp: Date;
  userIds: string[];
}

export interface PriorityFeedUpdatePayload extends FeedUpdatePayload {
  priority: 'low' | 'normal' | 'high';
  urgency: number; // 1-10 scale
  targetUserIds: string[];
}

export interface FeedConflictResolution {
  originalUpdate: FeedUpdatePayload;
  resolvedUpdate: FeedUpdatePayload;
  conflictType: 'duplicate' | 'outdated' | 'priority_override';
  resolutionTimestamp: Date;
}

export interface UserPresencePayload {
  userId: string;
  username: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: Date;
}

export interface UserActivityPayload {
  userId: string;
  username: string;
  activity: 'posting' | 'commenting' | 'liking' | 'browsing' | 'streaming';
  timestamp: Date;
  contentId?: string;
  contentType?: 'video' | 'post';
}

// Recommendation event interfaces
export interface TrendingContentPayload {
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  engagementScore: number;
  type: 'trending';
  trendingRank: number;
  timeWindow: '1h' | '6h' | '24h';
  category?: string;
}

export interface RecommendationPayload {
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: Date;
  type: 'recommended';
  personalizedScore: number;
  recommendationReason: string;
  fallbackToTrending?: boolean;
  mediaUrl?: string;
  postType?: string;
}

export interface RecommendationFeedbackPayload {
  userId: string;
  postId: string;
  feedback: 'positive' | 'negative' | 'neutral';
  feedbackType: 'view' | 'like' | 'share' | 'dismiss' | 'report';
  timestamp: Date;
}

// Error and notification interfaces
export interface SocketErrorPayload {
  code: string;
  message: string;
  details?: any;
}

export interface NotificationPayload {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'system' | 'presence';
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
  'feed:priority_update': (payload: PriorityFeedUpdatePayload) => void;
  'feed:instant_refresh': (payload: FeedUpdatePayload) => void;
  'feed:personalized_update': (payload: FeedUpdatePayload) => void;
  'feed:conflict_resolved': (payload: FeedConflictResolution) => void;
  
  // User presence events
  'user:online': (payload: UserPresencePayload) => void;
  'user:offline': (payload: UserPresencePayload) => void;
  'user:presence': (payload: UserPresencePayload) => void;
  'user:bulk_presence': (payload: UserPresencePayload[]) => void;
  'user:activity': (payload: UserActivityPayload) => void;
  
  // Recommendation events
  'recommendation:trending_content': (payload: TrendingContentPayload) => void;
  'recommendation:personalized': (payload: RecommendationPayload) => void;
  'recommendation:batch': (payload: RecommendationPayload[]) => void;
  
  // Notification events
  'notification:new': (payload: NotificationPayload) => void;
  'notification:updated': (payload: NotificationPayload) => void;
  'notification:batch': (payload: NotificationPayload[]) => void;
  
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
  'request_instant_refresh': () => void;
  'request_personalized_feed': (payload: { preferences?: string[] }) => void;
  'report_feed_conflict': (payload: { updateId: string; issue: string }) => void;
  
  // Content room management
  'join_content': (payload: { contentType: 'video' | 'post'; contentId: string }) => void;
  'leave_content': (payload: { contentType: 'video' | 'post'; contentId: string }) => void;
  
  // Presence management
  'update_presence': (payload: { status: 'online' | 'away' }) => void;
  'request_user_presence': (payload: { userIds: string[] }) => void;
  
  // Notification management
  'mark_notification_read': (payload: { notificationId: string }) => void;
  'get_unread_notifications': () => void;
  
  // Recommendation management
  'request_recommendations': (payload: { limit?: number; preferences?: string[] }) => void;
  'recommendation_feedback': (payload: RecommendationFeedbackPayload) => void;
  'request_trending_content': (payload: { timeWindow?: '1h' | '6h' | '24h'; category?: string }) => void;
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