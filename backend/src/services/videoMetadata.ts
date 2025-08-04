/**
 * Video Metadata Service
 * Handles video metadata management, validation, and database operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { 
  Video, 
  CreateVideoRequest, 
  UpdateVideoRequest, 
  VideoFormat, 
  VideoStatus,
  DatabaseOperationResult 
} from '../types/supabase';

/**
 * Video metadata validation result
 */
export interface VideoValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Video statistics interface
 */
export interface VideoStatistics {
  id: string;
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
  duration: number;
  fileSizeMB: number;
  status: VideoStatus;
}

/**
 * Service for managing video metadata operations
 */
export class VideoMetadataService {
  private readonly supabase: SupabaseClient<any, 'public'>;
  private readonly maxTitleLength = 200;
  private readonly maxDescriptionLength = 2000;
  private readonly maxDurationSeconds = 300; // 5 minutes
  private readonly maxFileSizeBytes = 524288000; // 500MB
  private readonly supportedFormats: VideoFormat[] = ['mp4', 'mov', 'avi'];

  constructor(supabaseClient: SupabaseClient<any, 'public'>) {
    this.supabase = supabaseClient;
  }

  /**
   * Validates video metadata before database operations
   */
  validateVideoMetadata(metadata: CreateVideoRequest): VideoValidationResult {
    const errors: string[] = [];

    // Validate title
    if (!metadata.title || metadata.title.trim().length === 0) {
      errors.push('Title cannot be empty');
    } else if (metadata.title.length > this.maxTitleLength) {
      errors.push(`Title cannot exceed ${this.maxTitleLength} characters`);
    }

    // Validate description (optional)
    if (metadata.description && metadata.description.length > this.maxDescriptionLength) {
      errors.push(`Description cannot exceed ${this.maxDescriptionLength} characters`);
    }

    // Validate video URL
    if (!metadata.video_url || metadata.video_url.trim().length === 0) {
      errors.push('Video URL cannot be empty');
    }

    // Validate duration
    if (metadata.duration <= 0) {
      errors.push('Duration must be greater than 0');
    } else if (metadata.duration > this.maxDurationSeconds) {
      errors.push(`Duration cannot exceed ${this.maxDurationSeconds} seconds (5 minutes)`);
    }

    // Validate file size
    if (metadata.file_size <= 0) {
      errors.push('File size must be greater than 0');
    } else if (metadata.file_size > this.maxFileSizeBytes) {
      errors.push(`File size cannot exceed ${this.maxFileSizeBytes} bytes (500MB)`);
    }

    // Validate format
    if (!this.supportedFormats.includes(metadata.format)) {
      errors.push(`Format must be one of: ${this.supportedFormats.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Creates a new video record in the database
   */
  async createVideoRecord(
    userId: string, 
    videoData: CreateVideoRequest
  ): Promise<DatabaseOperationResult<Video>> {
    const startTime = Date.now();

    try {
      logger.info('Creating video record', { userId, title: videoData.title });

      // Validate metadata first
      const validation = this.validateVideoMetadata(videoData);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          executionTime: Date.now() - startTime
        };
      }

      // Prepare video record
      const videoRecord = {
        user_id: userId,
        title: videoData.title.trim(),
        description: videoData.description?.trim() || null,
        video_url: videoData.video_url.trim(),
        thumbnail_url: videoData.thumbnail_url?.trim() || null,
        duration: videoData.duration,
        file_size: videoData.file_size,
        format: videoData.format,
        status: 'processing' as VideoStatus
      };

      // Insert into database
      const { data, error } = await this.supabase
        .from('videos')
        .insert(videoRecord)
        .select()
        .single();

      if (error) {
        logger.error('Failed to create video record', { error: error.message, userId });
        return {
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime
        };
      }

      logger.info('Video record created successfully', { videoId: data.id, userId });
      
      return {
        success: true,
        data: data as Video,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Error creating video record', { error: errorMessage, userId });
      
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Updates an existing video record
   */
  async updateVideoRecord(
    videoId: string,
    userId: string,
    updateData: UpdateVideoRequest
  ): Promise<DatabaseOperationResult<Video>> {
    const startTime = Date.now();

    try {
      logger.info('Updating video record', { videoId, userId });

      // Prepare update data
      const updates: any = {
        updated_at: new Date().toISOString()
      };

      if (updateData.title !== undefined) {
        if (updateData.title.trim().length === 0) {
          return {
            success: false,
            error: 'Title cannot be empty',
            executionTime: Date.now() - startTime
          };
        }
        if (updateData.title.length > this.maxTitleLength) {
          return {
            success: false,
            error: `Title cannot exceed ${this.maxTitleLength} characters`,
            executionTime: Date.now() - startTime
          };
        }
        updates.title = updateData.title.trim();
      }

      if (updateData.description !== undefined) {
        if (updateData.description && updateData.description.length > this.maxDescriptionLength) {
          return {
            success: false,
            error: `Description cannot exceed ${this.maxDescriptionLength} characters`,
            executionTime: Date.now() - startTime
          };
        }
        updates.description = updateData.description?.trim() || null;
      }

      if (updateData.thumbnail_url !== undefined) {
        updates.thumbnail_url = updateData.thumbnail_url?.trim() || null;
      }

      if (updateData.status !== undefined) {
        updates.status = updateData.status;
      }

      // Update in database with user ownership check
      const { data, error } = await this.supabase
        .from('videos')
        .update(updates)
        .eq('id', videoId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update video record', { error: error.message, videoId, userId });
        return {
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'Video not found or access denied',
          executionTime: Date.now() - startTime
        };
      }

      logger.info('Video record updated successfully', { videoId, userId });
      
      return {
        success: true,
        data: data as Video,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Error updating video record', { error: errorMessage, videoId, userId });
      
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Retrieves videos for a specific user
   */
  async getVideosByUser(
    userId: string, 
    limit: number = 20
  ): Promise<DatabaseOperationResult<Video[]>> {
    const startTime = Date.now();

    try {
      logger.info('Retrieving videos for user', { userId, limit });

      const { data, error } = await this.supabase
        .from('videos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to retrieve user videos', { error: error.message, userId });
        return {
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime
        };
      }

      logger.info('User videos retrieved successfully', { userId, count: data.length });
      
      return {
        success: true,
        data: data as Video[],
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Error retrieving user videos', { error: errorMessage, userId });
      
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Deletes a video record (user must own the video)
   */
  async deleteVideoRecord(
    videoId: string,
    userId: string
  ): Promise<DatabaseOperationResult<Video>> {
    const startTime = Date.now();

    try {
      logger.info('Deleting video record', { videoId, userId });

      const { data, error } = await this.supabase
        .from('videos')
        .delete()
        .eq('id', videoId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to delete video record', { error: error.message, videoId, userId });
        return {
          success: false,
          error: error.message,
          executionTime: Date.now() - startTime
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'Video not found or access denied',
          executionTime: Date.now() - startTime
        };
      }

      logger.info('Video record deleted successfully', { videoId, userId });
      
      return {
        success: true,
        data: data as Video,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Error deleting video record', { error: errorMessage, videoId, userId });
      
      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Gets video statistics for analytics
   */
  getVideoStatistics(video: Video): VideoStatistics {
    const engagementRate = video.views_count > 0 
      ? (video.likes_count + video.comments_count) / video.views_count 
      : 0;

    const fileSizeMB = Math.round((video.file_size / (1024 * 1024)) * 100) / 100;

    return {
      id: video.id,
      views: video.views_count,
      likes: video.likes_count,
      comments: video.comments_count,
      engagementRate: Math.round(engagementRate * 100) / 100,
      duration: video.duration,
      fileSizeMB,
      status: video.status
    };
  }

  /**
   * Gets video schema validation rules for documentation
   */
  getSchemaValidationRules() {
    return {
      title: {
        required: true,
        maxLength: this.maxTitleLength,
        minLength: 1
      },
      description: {
        required: false,
        maxLength: this.maxDescriptionLength
      },
      duration: {
        required: true,
        min: 1,
        max: this.maxDurationSeconds
      },
      fileSize: {
        required: true,
        min: 1,
        max: this.maxFileSizeBytes
      },
      format: {
        required: true,
        allowedValues: this.supportedFormats
      }
    };
  }
}