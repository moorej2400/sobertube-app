/**
 * Video Metadata Service Integration Tests
 * Tests video metadata operations against real Supabase instance
 */

import { VideoMetadataService } from '../../src/services/videoMetadata';
import { getSupabaseClient } from '../../src/services/supabase';
import { CreateVideoRequest, UpdateVideoRequest, VideoStatus } from '../../src/types/supabase';

describe('Video Metadata Integration Tests', () => {
  let videoMetadataService: VideoMetadataService;
  const testUserId = 'test-user-video-metadata';
  let createdVideoIds: string[] = [];

  beforeAll(async () => {
    const supabaseClient = getSupabaseClient();
    videoMetadataService = new VideoMetadataService(supabaseClient);
  });

  afterEach(async () => {
    // Clean up any created videos
    if (createdVideoIds.length > 0) {
      const supabaseClient = getSupabaseClient();
      await supabaseClient
        .from('videos')
        .delete()
        .in('id', createdVideoIds);
      createdVideoIds = [];
    }
  });

  describe('Database Schema Integration', () => {
    it('should create video record with all required fields', async () => {
      // Arrange
      const videoData: CreateVideoRequest = {
        title: 'Integration Test Video',
        description: 'Testing video metadata creation',
        video_url: 'https://example.com/test-video.mp4',
        thumbnail_url: 'https://example.com/test-thumb.jpg',
        duration: 120, // 2 minutes
        file_size: 25000000, // 25MB
        format: 'mp4'
      };

      // Act
      const result = await videoMetadataService.createVideoRecord(testUserId, videoData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBeDefined();
      expect(result.data?.user_id).toBe(testUserId);
      expect(result.data?.title).toBe(videoData.title);
      expect(result.data?.description).toBe(videoData.description);
      expect(result.data?.video_url).toBe(videoData.video_url);
      expect(result.data?.thumbnail_url).toBe(videoData.thumbnail_url);
      expect(result.data?.duration).toBe(videoData.duration);
      expect(result.data?.file_size).toBe(videoData.file_size);
      expect(result.data?.format).toBe(videoData.format);
      expect(result.data?.status).toBe('processing');
      expect(result.data?.views_count).toBe(0);
      expect(result.data?.likes_count).toBe(0);
      expect(result.data?.comments_count).toBe(0);
      expect(result.data?.created_at).toBeDefined();
      expect(result.data?.updated_at).toBeDefined();

      if (result.data?.id) {
        createdVideoIds.push(result.data.id);
      }
    });

    it('should create video record with minimal required fields', async () => {
      // Arrange
      const videoData: CreateVideoRequest = {
        title: 'Minimal Video',
        video_url: 'https://example.com/minimal.mp4',
        duration: 60,
        file_size: 10000000,
        format: 'mp4'
      };

      // Act
      const result = await videoMetadataService.createVideoRecord(testUserId, videoData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe(videoData.title);
      expect(result.data?.description).toBeNull();
      expect(result.data?.thumbnail_url).toBeNull();

      if (result.data?.id) {
        createdVideoIds.push(result.data.id);
      }
    });

    it('should enforce database constraints for invalid data', async () => {
      // Arrange - Invalid duration (over 5 minutes)
      const invalidVideoData: CreateVideoRequest = {
        title: 'Invalid Video',
        video_url: 'https://example.com/invalid.mp4',
        duration: 400, // Over 5 minutes
        file_size: 10000000,
        format: 'mp4'
      };

      // Act
      const result = await videoMetadataService.createVideoRecord(testUserId, invalidVideoData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Duration cannot exceed 300 seconds');
    });

    it('should enforce foreign key constraint for user_id', async () => {
      // Arrange
      const nonExistentUserId = 'non-existent-user-id';
      const videoData: CreateVideoRequest = {
        title: 'Foreign Key Test',
        video_url: 'https://example.com/fk-test.mp4',
        duration: 120,
        file_size: 10000000,
        format: 'mp4'
      };

      // Act
      const result = await videoMetadataService.createVideoRecord(nonExistentUserId, videoData);

      // Assert - Should fail due to foreign key constraint
      // Note: In test environment without real user records, this will gracefully fail
      expect(result.success).toBe(false);
    });
  });

  describe('CRUD Operations Integration', () => {
    let testVideoId: string;

    beforeEach(async () => {
      // Create a test video for update/delete operations
      const videoData: CreateVideoRequest = {
        title: 'CRUD Test Video',
        description: 'Video for CRUD testing',
        video_url: 'https://example.com/crud-test.mp4',
        duration: 180,
        file_size: 30000000,
        format: 'mov'
      };

      const result = await videoMetadataService.createVideoRecord(testUserId, videoData);
      if (result.success && result.data?.id) {
        testVideoId = result.data.id;
        createdVideoIds.push(testVideoId);
      }
    });

    it('should update video record successfully', async () => {
      // Arrange
      const updateData: UpdateVideoRequest = {
        title: 'Updated CRUD Test Video',
        description: 'Updated description for testing',
        status: 'ready' as VideoStatus
      };

      // Act
      const result = await videoMetadataService.updateVideoRecord(testVideoId, testUserId, updateData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe(updateData.title);
      expect(result.data?.description).toBe(updateData.description);
      expect(result.data?.status).toBe(updateData.status);
      expect(result.data?.updated_at).toBeDefined();
    });

    it('should prevent updating video owned by different user', async () => {
      // Arrange
      const differentUserId = 'different-user-id';
      const updateData: UpdateVideoRequest = {
        title: 'Unauthorized Update'
      };

      // Act
      const result = await videoMetadataService.updateVideoRecord(testVideoId, differentUserId, updateData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Video not found or access denied');
    });

    it('should retrieve videos by user', async () => {
      // Act
      const result = await videoMetadataService.getVideosByUser(testUserId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data?.length).toBeGreaterThan(0);
      
      // Check that all videos belong to the test user
      result.data?.forEach(video => {
        expect(video.user_id).toBe(testUserId);
      });
    });

    it('should delete video record successfully', async () => {
      // Act
      const result = await videoMetadataService.deleteVideoRecord(testVideoId, testUserId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(testVideoId);

      // Remove from cleanup list since it's already deleted
      createdVideoIds = createdVideoIds.filter(id => id !== testVideoId);

      // Verify deletion by trying to retrieve
      const retrievalResult = await videoMetadataService.getVideosByUser(testUserId);
      const deletedVideo = retrievalResult.data?.find(v => v.id === testVideoId);
      expect(deletedVideo).toBeUndefined();
    });

    it('should prevent deleting video owned by different user', async () => {
      // Arrange
      const differentUserId = 'different-user-id';

      // Act
      const result = await videoMetadataService.deleteVideoRecord(testVideoId, differentUserId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Video not found or access denied');
    });
  });

  describe('Validation Integration', () => {
    it('should validate and reject video with empty title', async () => {
      // Arrange
      const invalidVideoData: CreateVideoRequest = {
        title: '',
        video_url: 'https://example.com/invalid.mp4',
        duration: 120,
        file_size: 10000000,
        format: 'mp4'
      };

      // Act
      const result = await videoMetadataService.createVideoRecord(testUserId, invalidVideoData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Title cannot be empty');
    });

    it('should validate and reject video with oversized file', async () => {
      // Arrange
      const invalidVideoData: CreateVideoRequest = {
        title: 'Oversized Video',
        video_url: 'https://example.com/oversized.mp4',
        duration: 120,
        file_size: 600000000, // Over 500MB
        format: 'mp4'
      };

      // Act
      const result = await videoMetadataService.createVideoRecord(testUserId, invalidVideoData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('File size cannot exceed 524288000 bytes');
    });

    it('should validate and reject video with unsupported format', async () => {
      // Arrange
      const invalidVideoData: CreateVideoRequest = {
        title: 'Unsupported Format',
        video_url: 'https://example.com/unsupported.mkv',
        duration: 120,
        file_size: 10000000,
        format: 'mkv' as any // Unsupported format
      };

      // Act
      const result = await videoMetadataService.createVideoRecord(testUserId, invalidVideoData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Format must be one of: mp4, mov, avi');
    });
  });

  describe('Statistics and Analytics Integration', () => {
    let statsTestVideoId: string;

    beforeEach(async () => {
      // Create a video with some engagement stats
      const videoData: CreateVideoRequest = {
        title: 'Statistics Test Video',
        video_url: 'https://example.com/stats-test.mp4',
        duration: 240,
        file_size: 75000000,
        format: 'avi'
      };

      const result = await videoMetadataService.createVideoRecord(testUserId, videoData);
      if (result.success && result.data?.id) {
        statsTestVideoId = result.data.id;
        createdVideoIds.push(statsTestVideoId);

        // Simulate some engagement by updating counts
        const supabaseClient = getSupabaseClient();
        await supabaseClient
          .from('videos')
          .update({
            views_count: 100,
            likes_count: 25,
            comments_count: 10
          })
          .eq('id', statsTestVideoId);
      }
    });

    it('should calculate video statistics correctly', async () => {
      // Arrange - Get the video with updated stats
      const supabaseClient = getSupabaseClient();
      const { data: video } = await supabaseClient
        .from('videos')
        .select('*')
        .eq('id', statsTestVideoId)
        .single();

      // Act
      const stats = videoMetadataService.getVideoStatistics(video);

      // Assert
      expect(stats.id).toBe(statsTestVideoId);
      expect(stats.views).toBe(100);
      expect(stats.likes).toBe(25);
      expect(stats.comments).toBe(10);
      expect(stats.engagementRate).toBe(0.35); // (25 + 10) / 100
      expect(stats.duration).toBe(240);
      expect(stats.fileSizeMB).toBe(71.53); // 75000000 / (1024*1024)
      expect(stats.status).toBe('processing');
    });
  });

  describe('Performance and Indexes Integration', () => {
    it('should efficiently query videos by user with proper indexing', async () => {
      // Arrange - Create multiple videos to test query performance
      const videoPromises = Array.from({ length: 5 }, (_, i) => 
        videoMetadataService.createVideoRecord(testUserId, {
          title: `Performance Test Video ${i + 1}`,
          video_url: `https://example.com/perf-test-${i + 1}.mp4`,
          duration: 60 + (i * 30),
          file_size: 10000000 + (i * 5000000),
          format: 'mp4'
        })
      );

      const results = await Promise.all(videoPromises);
      
      // Track created videos for cleanup
      results.forEach(result => {
        if (result.success && result.data?.id) {
          createdVideoIds.push(result.data.id);
        }
      });

      // Act - Query with timing
      const startTime = Date.now();
      const queryResult = await videoMetadataService.getVideosByUser(testUserId, 10);
      const executionTime = Date.now() - startTime;

      // Assert
      expect(queryResult.success).toBe(true);
      expect(queryResult.data?.length).toBeGreaterThanOrEqual(5);
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify ordering (newest first)
      if (queryResult.data && queryResult.data.length > 1) {
        for (let i = 1; i < queryResult.data.length; i++) {
          const current = new Date(queryResult.data[i].created_at);
          const previous = new Date(queryResult.data[i - 1].created_at);
          expect(current.getTime()).toBeLessThanOrEqual(previous.getTime());
        }
      }
    });
  });

  describe('Schema Validation Rules', () => {
    it('should provide comprehensive validation rules', () => {
      // Act
      const rules = videoMetadataService.getSchemaValidationRules();

      // Assert
      expect(rules.title.required).toBe(true);
      expect(rules.title.maxLength).toBe(200);
      expect(rules.title.minLength).toBe(1);

      expect(rules.description.required).toBe(false);
      expect(rules.description.maxLength).toBe(2000);

      expect(rules.duration.required).toBe(true);
      expect(rules.duration.min).toBe(1);
      expect(rules.duration.max).toBe(300);

      expect(rules.fileSize.required).toBe(true);
      expect(rules.fileSize.min).toBe(1);
      expect(rules.fileSize.max).toBe(524288000);

      expect(rules.format.required).toBe(true);
      expect(rules.format.allowedValues).toEqual(['mp4', 'mov', 'avi']);
    });
  });
});