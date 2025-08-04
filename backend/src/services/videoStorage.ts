/**
 * Video Storage Service
 * Handles Supabase storage bucket configuration and video file operations
 */

import { getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';

interface VideoStorageResult {
  success: boolean;
  error?: string;
  data?: any;
}

export class VideoStorageService {
  private readonly bucketName = 'sobertube-videos';
  private readonly maxFileSize = 500 * 1024 * 1024; // 500MB
  private readonly supportedFormats = ['mp4', 'mov', 'avi'];
  private readonly supportedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];

  /**
   * Configure the video storage bucket with proper settings
   */
  async configureVideoBucket(): Promise<VideoStorageResult> {
    try {
      const supabaseClient = getSupabaseClient();
      
      // Check if bucket already exists
      const { data: existingBucket, error: getBucketError } = await supabaseClient.storage.getBucket(this.bucketName);

      if (existingBucket) {
        logger.info('Video storage bucket already exists', { bucketName: this.bucketName });
        return { success: true, data: existingBucket };
      }

      // Create bucket if it doesn't exist
      if (getBucketError && getBucketError.message.includes('not found') || getBucketError?.message.includes('Bucket not found')) {
        const { data: newBucket, error: createError } = await supabaseClient.storage.createBucket(this.bucketName, {
          public: true,
          fileSizeLimit: this.maxFileSize,
          allowedMimeTypes: this.supportedMimeTypes
        });

        if (createError) {
          logger.error('Failed to create video storage bucket', {
            bucketName: this.bucketName,
            error: createError.message
          });
          return { success: false, error: createError.message };
        }

        logger.info('Video storage bucket created successfully', {
          bucketName: this.bucketName,
          bucket: newBucket
        });

        return { success: true, data: newBucket };
      }

      // Handle other errors
      logger.error('Error checking video storage bucket', {
        bucketName: this.bucketName,
        error: getBucketError?.message
      });
      
      return { success: false, error: getBucketError?.message || 'Unknown error' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Video storage bucket configuration failed', {
        bucketName: this.bucketName,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Generate standardized path for video file storage
   * Path structure: {user_id}/{year}/{month}/{video_id}.{ext}
   */
  generateVideoPath(userId: string, videoId: string, fileExtension: string): string {
    const now = new Date(Date.now());
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    return `${userId}/${year}/${month}/${videoId}.${fileExtension}`;
  }

  /**
   * Validate video file format and size
   */
  validateVideoFile(fileName: string, fileSize: number): boolean {
    // Check file size
    if (fileSize > this.maxFileSize) {
      return false;
    }

    // Check file extension
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension || !this.supportedFormats.includes(extension)) {
      return false;
    }

    return true;
  }

  /**
   * Test bucket accessibility and permissions
   */
  async testBucketAccess(): Promise<VideoStorageResult> {
    try {
      const supabaseClient = getSupabaseClient();
      const bucket = supabaseClient.storage.from(this.bucketName);

      // Test read access by listing bucket contents
      const { data, error } = await bucket.list('', {
        limit: 1,
        offset: 0
      });

      if (error) {
        logger.error('Bucket access test failed', {
          bucketName: this.bucketName,
          error: error.message
        });
        return { success: false, error: error.message };
      }

      logger.info('Bucket access test successful', {
        bucketName: this.bucketName
      });

      return { success: true, data };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Bucket access test error', {
        bucketName: this.bucketName,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get bucket configuration details
   */
  getBucketConfig() {
    return {
      name: this.bucketName,
      maxFileSize: this.maxFileSize,
      supportedFormats: this.supportedFormats,
      supportedMimeTypes: this.supportedMimeTypes
    };
  }
}

// Export singleton instance
export const videoStorageService = new VideoStorageService();