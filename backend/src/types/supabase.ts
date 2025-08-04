/**
 * Supabase TypeScript Interfaces
 * Type definitions for Supabase client operations and database entities
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Database connection status
 */
export interface DatabaseConnectionStatus {
  isConnected: boolean;
  lastChecked: Date;
  latency?: number;
  error?: string;
}

/**
 * Database health check result
 */
export interface DatabaseHealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  connectionStatus: DatabaseConnectionStatus;
  timestamp: Date;
  details?: {
    poolSize?: number;
    activeConnections?: number;
    pendingConnections?: number;
  };
}

/**
 * Supabase client configuration options
 */
export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  options?: {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
    };
    db?: {
      schema?: string;
    };
    global?: {
      headers?: Record<string, string>;
    };
  };
}

/**
 * Database transaction context
 */
export interface DatabaseTransaction {
  id: string;
  startTime: Date;
  isActive: boolean;
  client: SupabaseClient<any, 'public'>;
}

/**
 * Database operation result
 */
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string | undefined;
  executionTime: number;
}

/**
 * Connection pool statistics
 */
export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingConnections: number;
  maxConnections: number;
}

/**
 * Database entity types
 */

/**
 * User database entity
 */
export interface User {
  id: string;
  email: string;
  username: string;
  display_name?: string;
  bio?: string;
  profile_picture_url?: string;
  sobriety_date?: string;
  location?: string;
  privacy_level: 'public' | 'friends' | 'private';
  created_at: string;
  updated_at: string;
}

/**
 * Post type enumeration
 */
export type PostType = 'Recovery Update' | 'Milestone' | 'Inspiration' | 'Question' | 'Gratitude';

/**
 * Post database entity
 */
export interface Post {
  id: string;
  user_id: string;
  content: string;
  post_type: PostType;
  image_url?: string;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Post creation payload (for API requests)
 */
export interface CreatePostRequest {
  content: string;
  post_type: PostType;
  image_url?: string;
}

/**
 * Post update payload (for API requests)
 */
export interface UpdatePostRequest {
  content?: string;
  post_type?: PostType;
  image_url?: string;
}

/**
 * Post with user information (for API responses)
 */
export interface PostWithUser extends Post {
  user: Pick<User, 'id' | 'username' | 'display_name' | 'profile_picture_url'>;
}

/**
 * Video status enumeration
 */
export type VideoStatus = 'processing' | 'ready' | 'failed';

/**
 * Video format enumeration
 */
export type VideoFormat = 'mp4' | 'mov' | 'avi';

/**
 * Video database entity
 */
export interface Video {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url?: string;
  duration: number; // in seconds
  file_size: number; // in bytes
  format: VideoFormat;
  views_count: number;
  likes_count: number;
  comments_count: number;
  status: VideoStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Video creation payload (for API requests)
 */
export interface CreateVideoRequest {
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url?: string;
  duration: number;
  file_size: number;
  format: VideoFormat;
}

/**
 * Video update payload (for API requests)
 */
export interface UpdateVideoRequest {
  title?: string;
  description?: string;
  thumbnail_url?: string;
  status?: VideoStatus;
}

/**
 * Video with user information (for API responses)
 */
export interface VideoWithUser extends Video {
  user: Pick<User, 'id' | 'username' | 'display_name' | 'profile_picture_url'>;
}

/**
 * Video upload metadata
 */
export interface VideoUploadMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  duration?: number;
  path: string;
  uploadedAt: Date;
}