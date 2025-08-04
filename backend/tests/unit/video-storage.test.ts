/**
 * Video Storage Service Unit Tests
 * Tests for utility methods that don't require Supabase mocking
 */

import { VideoStorageService } from '../../src/services/videoStorage';

describe('Video Storage Service - Unit Tests', () => {
  let videoStorageService: VideoStorageService;

  beforeEach(() => {
    videoStorageService = new VideoStorageService();
  });

  describe('generateVideoPath', () => {
    it('should generate correct path structure for video file', () => {
      // Arrange
      const userId = 'user-123';
      const videoId = 'video-456';
      const fileExtension = 'mp4';
      const mockDate = new Date('2024-01-15T10:30:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());

      // Act
      const path = videoStorageService.generateVideoPath(userId, videoId, fileExtension);

      // Assert
      expect(path).toBe('user-123/2024/01/video-456.mp4');
      
      // Cleanup
      jest.restoreAllMocks();
    });

    it('should handle different file extensions', () => {
      // Arrange
      const userId = 'user-123';
      const videoId = 'video-456';
      const mockDate = new Date('2024-01-15T10:30:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());

      // Act
      const pathMov = videoStorageService.generateVideoPath(userId, videoId, 'mov');
      const pathAvi = videoStorageService.generateVideoPath(userId, videoId, 'avi');

      // Assert
      expect(pathMov).toBe('user-123/2024/01/video-456.mov');
      expect(pathAvi).toBe('user-123/2024/01/video-456.avi');
      
      // Cleanup
      jest.restoreAllMocks();
    });

    it('should pad month with leading zero', () => {
      // Arrange
      const userId = 'user';
      const videoId = 'video';
      const extension = 'mp4';
      const mockDate = new Date('2024-03-05T10:30:00Z'); // March = month 3
      jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());

      // Act
      const path = videoStorageService.generateVideoPath(userId, videoId, extension);

      // Assert
      expect(path).toBe('user/2024/03/video.mp4');
      
      // Cleanup
      jest.restoreAllMocks();
    });

    it('should handle December correctly', () => {
      // Arrange
      const userId = 'user';
      const videoId = 'video';
      const extension = 'mp4';
      const mockDate = new Date('2024-12-25T10:30:00Z'); // December = month 12
      jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());

      // Act
      const path = videoStorageService.generateVideoPath(userId, videoId, extension);

      // Assert
      expect(path).toBe('user/2024/12/video.mp4');
      
      // Cleanup
      jest.restoreAllMocks();
    });
  });

  describe('validateVideoFile', () => {
    it('should validate supported video formats', () => {
      // Act & Assert
      expect(videoStorageService.validateVideoFile('test.mp4', 100 * 1024 * 1024)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.mov', 100 * 1024 * 1024)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.avi', 100 * 1024 * 1024)).toBe(true);
    });

    it('should validate formats case-insensitively', () => {
      const fileSize = 100 * 1024 * 1024;
      
      // Act & Assert
      expect(videoStorageService.validateVideoFile('test.MP4', fileSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.MOV', fileSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.AVI', fileSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.Mp4', fileSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.mOv', fileSize)).toBe(true);
    });

    it('should reject unsupported video formats', () => {
      const fileSize = 100 * 1024 * 1024;
      
      // Act & Assert
      expect(videoStorageService.validateVideoFile('test.mkv', fileSize)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.wmv', fileSize)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.flv', fileSize)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.webm', fileSize)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.txt', fileSize)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.pdf', fileSize)).toBe(false);
    });

    it('should reject files larger than 500MB', () => {
      const maxSize = 500 * 1024 * 1024; // 500MB
      const tooLarge = maxSize + 1; // Just over 500MB
      
      // Act & Assert
      expect(videoStorageService.validateVideoFile('test.mp4', maxSize)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.mp4', tooLarge)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.mp4', 600 * 1024 * 1024)).toBe(false);
    });

    it('should accept files smaller than or equal to 500MB', () => {
      // Act & Assert
      expect(videoStorageService.validateVideoFile('test.mp4', 0)).toBe(true); // Empty file
      expect(videoStorageService.validateVideoFile('test.mp4', 1 * 1024 * 1024)).toBe(true); // 1MB
      expect(videoStorageService.validateVideoFile('test.mp4', 100 * 1024 * 1024)).toBe(true); // 100MB
      expect(videoStorageService.validateVideoFile('test.mp4', 499 * 1024 * 1024)).toBe(true); // 499MB
      expect(videoStorageService.validateVideoFile('test.mp4', 500 * 1024 * 1024)).toBe(true); // Exactly 500MB
    });

    it('should handle files without extensions', () => {
      // Act & Assert
      expect(videoStorageService.validateVideoFile('test', 100 * 1024 * 1024)).toBe(false);
      expect(videoStorageService.validateVideoFile('test.', 100 * 1024 * 1024)).toBe(false);
    });

    it('should handle files with multiple dots', () => {
      // Act & Assert
      expect(videoStorageService.validateVideoFile('test.backup.mp4', 100 * 1024 * 1024)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.old.mov', 100 * 1024 * 1024)).toBe(true);
      expect(videoStorageService.validateVideoFile('test.v1.avi', 100 * 1024 * 1024)).toBe(true);
    });
  });

  describe('getBucketConfig', () => {
    it('should return correct bucket configuration', () => {
      // Act
      const config = videoStorageService.getBucketConfig();

      // Assert
      expect(config.name).toBe('sobertube-videos');
      expect(config.maxFileSize).toBe(500 * 1024 * 1024);
      expect(config.supportedFormats).toEqual(['mp4', 'mov', 'avi']);
      expect(config.supportedMimeTypes).toEqual(['video/mp4', 'video/quicktime', 'video/x-msvideo']);
    });

    it('should return immutable configuration objects', () => {
      // Act
      const config1 = videoStorageService.getBucketConfig();
      const config2 = videoStorageService.getBucketConfig();

      // Assert
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
      
      // Test that modifying one doesn't affect the other
      config1.name = 'modified';
      expect(config2.name).toBe('sobertube-videos');
    });

    it('should have consistent configuration values', () => {
      // Act
      const config = videoStorageService.getBucketConfig();

      // Assert specific values
      expect(typeof config.name).toBe('string');
      expect(typeof config.maxFileSize).toBe('number');
      expect(Array.isArray(config.supportedFormats)).toBe(true);
      expect(Array.isArray(config.supportedMimeTypes)).toBe(true);
      
      // Ensure arrays have expected lengths
      expect(config.supportedFormats.length).toBe(3);
      expect(config.supportedMimeTypes.length).toBe(3);
    });
  });
});