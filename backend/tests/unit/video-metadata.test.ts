/**
 * Video Metadata Service Unit Tests
 * Tests for video metadata management and database operations
 */

import { VideoMetadataService } from '../../src/services/videoMetadata';
import { Video, CreateVideoRequest, UpdateVideoRequest, VideoFormat } from '../../src/types/supabase';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock Supabase client with proper method chaining
const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis()
};

const mockSupabaseClient = {
  from: jest.fn(() => mockQueryBuilder)
};

describe('Video Metadata Service - Unit Tests', () => {
  let videoMetadataService: VideoMetadataService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all mock functions
    Object.values(mockQueryBuilder).forEach(mock => {
      if (typeof mock === 'function') {
        mock.mockReturnThis();
      }
    });
    // @ts-ignore - Mock for testing
    videoMetadataService = new VideoMetadataService(mockSupabaseClient);
  });

  describe('validateVideoMetadata', () => {
    it('should validate correct video metadata', () => {
      // Arrange
      const validMetadata: CreateVideoRequest = {
        title: 'My Recovery Journey',
        description: 'A video about my first 30 days',
        video_url: 'https://example.com/video.mp4',
        thumbnail_url: 'https://example.com/thumb.jpg',
        duration: 180, // 3 minutes
        file_size: 50000000, // 50MB
        format: 'mp4'
      };

      // Act
      const result = videoMetadataService.validateVideoMetadata(validMetadata);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject video with invalid title', () => {
      // Arrange
      const invalidMetadata: CreateVideoRequest = {
        title: '', // Empty title
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mp4'
      };

      // Act
      const result = videoMetadataService.validateVideoMetadata(invalidMetadata);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title cannot be empty');
    });

    it('should reject video with title too long', () => {
      // Arrange
      const longTitle = 'a'.repeat(201); // 201 characters
      const invalidMetadata: CreateVideoRequest = {
        title: longTitle,
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mp4'
      };

      // Act
      const result = videoMetadataService.validateVideoMetadata(invalidMetadata);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title cannot exceed 200 characters');
    });

    it('should reject video with invalid duration', () => {
      // Arrange
      const invalidMetadata: CreateVideoRequest = {
        title: 'Valid Title',
        video_url: 'https://example.com/video.mp4',
        duration: 400, // Over 5 minutes (300 seconds)
        file_size: 50000000,
        format: 'mp4'
      };

      // Act
      const result = videoMetadataService.validateVideoMetadata(invalidMetadata);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duration cannot exceed 300 seconds (5 minutes)');
    });

    it('should reject video with invalid file size', () => {
      // Arrange
      const invalidMetadata: CreateVideoRequest = {
        title: 'Valid Title',
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 600000000, // Over 500MB
        format: 'mp4'
      };

      // Act
      const result = videoMetadataService.validateVideoMetadata(invalidMetadata);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File size cannot exceed 524288000 bytes (500MB)');
    });

    it('should reject video with invalid format', () => {
      // Arrange
      const invalidMetadata: CreateVideoRequest = {
        title: 'Valid Title',
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mkv' as VideoFormat // Invalid format
      };

      // Act
      const result = videoMetadataService.validateVideoMetadata(invalidMetadata);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Format must be one of: mp4, mov, avi');
    });

    it('should reject video with invalid description length', () => {
      // Arrange
      const longDescription = 'a'.repeat(2001); // 2001 characters
      const invalidMetadata: CreateVideoRequest = {
        title: 'Valid Title',
        description: longDescription,
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mp4'
      };

      // Act
      const result = videoMetadataService.validateVideoMetadata(invalidMetadata);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Description cannot exceed 2000 characters');
    });
  });

  describe('createVideoRecord', () => {
    it('should create video record successfully', async () => {
      // Arrange
      const userId = 'user-123';
      const videoData: CreateVideoRequest = {
        title: 'My Recovery Journey',
        description: 'A video about recovery',
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mp4'
      };

      const expectedResponse = {
        data: [{
          id: 'video-123',
          user_id: userId,
          ...videoData,
          views_count: 0,
          likes_count: 0,
          comments_count: 0,
          status: 'processing',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }],
        error: null
      };

      // Mock the response
      mockQueryBuilder.single.mockResolvedValue(expectedResponse);

      // Act
      const result = await videoMetadataService.createVideoRecord(userId, videoData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('video-123');
      expect(result.data?.user_id).toBe(userId);
      expect(result.data?.status).toBe('processing');
    });

    it('should handle database errors during video creation', async () => {
      // Arrange
      const userId = 'user-123';
      const videoData: CreateVideoRequest = {
        title: 'My Recovery Journey',
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mp4'
      };

      const errorResponse = {
        data: null,
        error: { message: 'Database connection failed' }
      };

      // Mock the error response
      mockQueryBuilder.single.mockResolvedValue(errorResponse);

      // Act
      const result = await videoMetadataService.createVideoRecord(userId, videoData);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });
  });

  describe('updateVideoRecord', () => {
    it('should update video record successfully', async () => {
      // Arrange
      const videoId = 'video-123';
      const userId = 'user-123';
      const updateData: UpdateVideoRequest = {
        title: 'Updated Title',
        status: 'ready'
      };

      const expectedResponse = {
        data: [{
          id: videoId,
          user_id: userId,
          title: 'Updated Title',
          status: 'ready',
          updated_at: '2024-01-01T00:00:00Z'
        }],
        error: null
      };

      // Mock the update response
      mockQueryBuilder.single.mockResolvedValue(expectedResponse);

      // Act
      const result = await videoMetadataService.updateVideoRecord(videoId, userId, updateData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.title).toBe('Updated Title');
      expect(result.data?.status).toBe('ready');
    });
  });

  describe('getVideosByUser', () => {
    it('should retrieve user videos successfully', async () => {
      // Arrange
      const userId = 'user-123';
      const expectedVideos = [
        {
          id: 'video-1',
          user_id: userId,
          title: 'Video 1',
          status: 'ready',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'video-2',
          user_id: userId,
          title: 'Video 2',
          status: 'processing',
          created_at: '2024-01-02T00:00:00Z'
        }
      ];

      const expectedResponse = {
        data: expectedVideos,
        error: null
      };

      // Mock the select response
      mockQueryBuilder.limit.mockResolvedValue(expectedResponse);

      // Act
      const result = await videoMetadataService.getVideosByUser(userId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].id).toBe('video-1');
      expect(result.data?.[1].id).toBe('video-2');
    });
  });

  describe('deleteVideoRecord', () => {
    it('should delete video record successfully', async () => {
      // Arrange
      const videoId = 'video-123';
      const userId = 'user-123';

      const expectedResponse = {
        data: [{ id: videoId }],
        error: null
      };

      // Mock the delete response
      mockQueryBuilder.single.mockResolvedValue(expectedResponse);

      // Act
      const result = await videoMetadataService.deleteVideoRecord(videoId, userId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('getVideoStatistics', () => {
    it('should return video statistics correctly', () => {
      // Arrange
      const video: Video = {
        id: 'video-123',
        user_id: 'user-123',
        title: 'Test Video',
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mp4',
        views_count: 100,
        likes_count: 25,
        comments_count: 10,
        status: 'ready',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Act
      const stats = videoMetadataService.getVideoStatistics(video);

      // Assert
      expect(stats.id).toBe('video-123');
      expect(stats.views).toBe(100);
      expect(stats.likes).toBe(25);
      expect(stats.comments).toBe(10);
      expect(stats.engagementRate).toBe(0.35); // (25 + 10) / 100
      expect(stats.duration).toBe(180);
      expect(stats.fileSizeMB).toBe(47.68); // 50000000 / (1024*1024)
      expect(stats.status).toBe('ready');
    });

    it('should handle zero views correctly', () => {
      // Arrange
      const video: Video = {
        id: 'video-123',
        user_id: 'user-123',
        title: 'Test Video',
        video_url: 'https://example.com/video.mp4',
        duration: 180,
        file_size: 50000000,
        format: 'mp4',
        views_count: 0,
        likes_count: 0,
        comments_count: 0,
        status: 'ready',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Act
      const stats = videoMetadataService.getVideoStatistics(video);

      // Assert
      expect(stats.engagementRate).toBe(0);
    });
  });
});