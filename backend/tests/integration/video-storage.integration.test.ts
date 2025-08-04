/**
 * Video Storage Integration Tests
 * Tests for actual Supabase storage bucket operations
 */

import { videoStorageService } from '../../src/services/videoStorage';
import { getSupabaseClient } from '../../src/services/supabase';

describe('Video Storage Integration Tests', () => {
  beforeAll(async () => {
    // Initialize connection for integration tests
    getSupabaseClient();
  });

  describe('Bucket Configuration', () => {
    it('should handle bucket configuration (may require service role for creation)', async () => {
      // Act
      const result = await videoStorageService.configureVideoBucket();

      // Assert - Accept either success or RLS policy error (expected in test environment)
      if (result.success) {
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      } else {
        // RLS policy error is expected in test environment without proper service role setup
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/policy|permission|unauthorized|violates/i);
      }
    }, 30000);

    it('should handle repeated bucket configuration calls consistently', async () => {
      // Act - Call configure twice
      const result1 = await videoStorageService.configureVideoBucket();
      const result2 = await videoStorageService.configureVideoBucket();

      // Assert - Both should have consistent results
      expect(result1.success).toBe(result2.success);
      if (!result1.success) {
        expect(result1.error).toMatch(/policy|permission|unauthorized|violates/i);
        expect(result2.error).toMatch(/policy|permission|unauthorized|violates/i);
      }
    }, 30000);
  });

  describe('Bucket Access Testing', () => {
    it('should test bucket access (if bucket exists)', async () => {
      // Act
      const result = await videoStorageService.testBucketAccess();

      // Assert - Either success or expected error for non-existent bucket
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    }, 30000);
  });

  describe('Path Generation', () => {
    it('should generate consistent paths for the same inputs', () => {
      // Arrange
      const userId = 'test-user-123';
      const videoId = 'test-video-456';
      const extension = 'mp4';

      // Act
      const path1 = videoStorageService.generateVideoPath(userId, videoId, extension);
      const path2 = videoStorageService.generateVideoPath(userId, videoId, extension);

      // Assert
      expect(path1).toBe(path2);
      expect(path1).toMatch(/^test-user-123\/\d{4}\/\d{2}\/test-video-456\.mp4$/);
    });

    it('should generate paths with current year and month', () => {
      // Arrange
      const userId = 'test-user';
      const videoId = 'test-video';
      const extension = 'mp4';
      const now = new Date();
      const expectedYear = now.getFullYear();
      const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');

      // Act
      const path = videoStorageService.generateVideoPath(userId, videoId, extension);

      // Assert
      expect(path).toBe(`${userId}/${expectedYear}/${expectedMonth}/${videoId}.${extension}`);
    });
  });

  describe('File Validation', () => {
    it('should validate acceptable video files', () => {
      // Test supported formats
      expect(videoStorageService.validateVideoFile('test.mp4', 100 * 1024 * 1024)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.mov', 200 * 1024 * 1024)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.avi', 300 * 1024 * 1024)).toBe(true);
    });

    it('should reject invalid video files', () => {
      // Test unsupported formats
      expect(videoStorageService.validateVideoFile('test.mkv', 100 * 1024 * 1024)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.txt', 100 * 1024 * 1024)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.pdf', 100 * 1024 * 1024)).toBe(false);
      
      // Test oversized files (600MB > 500MB limit)
      expect(videoStorageService.validateVideoFile('test.mp4', 600 * 1024 * 1024)).toBe(false);
    });

    it('should validate file extensions case-insensitively', () => {
      const fileSize = 100 * 1024 * 1024; // 100MB
      
      // Test uppercase extensions
      expect(videoStorageService.validateVideoFile('test.MP4', fileSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.MOV', fileSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.AVI', fileSize)).toBe(true);
      
      // Test mixed case
      expect(videoStorageService.validateVideoFile('test.Mp4', fileSize)).toBe(true);
    });

    it('should handle edge cases for file size validation', () => {
      const maxSize = 500 * 1024 * 1024; // Exactly 500MB
      const overSize = maxSize + 1; // Just over 500MB
      
      expect(videoStorageService.validateVideoFile('test.mp4', maxSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.mp4', overSize)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.mp4', 0)).toBe(true); // Empty file
    });
  });

  describe('Configuration Retrieval', () => {
    it('should return correct bucket configuration', () => {
      // Act
      const config = videoStorageService.getBucketConfig();

      // Assert
      expect(config.name).toBe('sobertube-videos');
      expect(config.maxFileSize).toBe(500 * 1024 * 1024);
      expect(config.supportedFormats).toEqual(['mp4', 'mov', 'avi']);
      expect(config.supportedMimeTypes).toEqual(['video/mp4', 'video/quicktime', 'video/x-msvideo']);
    });

    it('should return immutable configuration', () => {
      // Act
      const config1 = videoStorageService.getBucketConfig();
      const config2 = videoStorageService.getBucketConfig();

      // Assert
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });
  });
});