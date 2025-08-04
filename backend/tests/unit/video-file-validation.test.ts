/**
 * Video File Validation Unit Tests
 * Tests for video file validation logic including format, size, and duration checks
 */

import { VideoFileValidator } from '../../src/services/videoFileValidator';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    access: jest.fn()
  },
  constants: {
    F_OK: 0
  }
}));

// Mock FFmpeg for duration validation
jest.mock('fluent-ffmpeg', () => {
  const mockFFmpeg = {
    ffprobe: jest.fn()
  };
  return mockFFmpeg;
});

import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

describe('Video File Validator - Unit Tests', () => {
  let videoFileValidator: VideoFileValidator;
  const mockStat = fs.promises.stat as jest.MockedFunction<typeof fs.promises.stat>;
  const mockFFProbe = ffmpeg.ffprobe as jest.MockedFunction<typeof ffmpeg.ffprobe>;

  beforeEach(() => {
    jest.clearAllMocks();
    videoFileValidator = new VideoFileValidator();
  });

  describe('validateFileFormat', () => {
    it('should accept valid MP4 files', () => {
      // Arrange
      const validMp4Files = [
        { filename: 'video.mp4', mimetype: 'video/mp4' },
        { filename: 'test.MP4', mimetype: 'video/mp4' },
        { filename: 'movie.mp4', mimetype: 'video/mpeg' }
      ];

      // Act & Assert
      validMp4Files.forEach(file => {
        const result = videoFileValidator.validateFileFormat(file.filename, file.mimetype);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should accept valid MOV files', () => {
      // Arrange
      const validMovFiles = [
        { filename: 'video.mov', mimetype: 'video/quicktime' },
        { filename: 'test.MOV', mimetype: 'video/quicktime' },
        { filename: 'movie.mov', mimetype: 'video/x-quicktime' }
      ];

      // Act & Assert
      validMovFiles.forEach(file => {
        const result = videoFileValidator.validateFileFormat(file.filename, file.mimetype);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should accept valid AVI files', () => {
      // Arrange
      const validAviFiles = [
        { filename: 'video.avi', mimetype: 'video/x-msvideo' },
        { filename: 'test.AVI', mimetype: 'video/avi' },
        { filename: 'movie.avi', mimetype: 'video/msvideo' }
      ];

      // Act & Assert
      validAviFiles.forEach(file => {
        const result = videoFileValidator.validateFileFormat(file.filename, file.mimetype);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject unsupported file formats', () => {
      // Arrange
      const unsupportedFiles = [
        { filename: 'video.mkv', mimetype: 'video/x-matroska' },
        { filename: 'video.wmv', mimetype: 'video/x-ms-wmv' },
        { filename: 'video.flv', mimetype: 'video/x-flv' },
        { filename: 'video.webm', mimetype: 'video/webm' },
        { filename: 'image.jpg', mimetype: 'image/jpeg' },
        { filename: 'document.pdf', mimetype: 'application/pdf' }
      ];

      // Act & Assert
      unsupportedFiles.forEach(file => {
        const result = videoFileValidator.validateFileFormat(file.filename, file.mimetype);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Unsupported file format. Only MP4, MOV, and AVI files are allowed.');
      });
    });

    it('should reject files with mismatched extension and MIME type', () => {
      // Arrange
      const mismatchedFiles = [
        { filename: 'video.mp4', mimetype: 'video/quicktime' },
        { filename: 'video.mov', mimetype: 'video/mp4' },
        { filename: 'video.avi', mimetype: 'video/mp4' }
      ];

      // Act & Assert
      mismatchedFiles.forEach(file => {
        const result = videoFileValidator.validateFileFormat(file.filename, file.mimetype);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('File extension does not match MIME type.');
      });
    });

    it('should handle missing file extension', () => {
      // Arrange
      const noExtensionFile = { filename: 'video', mimetype: 'video/mp4' };

      // Act
      const result = videoFileValidator.validateFileFormat(noExtensionFile.filename, noExtensionFile.mimetype);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File must have a valid extension.');
    });

    it('should sanitize malicious filenames', () => {
      // Arrange
      const maliciousFiles = [
        { filename: '../../../etc/passwd.mp4', mimetype: 'video/mp4' },
        { filename: 'video..\\..\\..\\windows\\system32.mp4', mimetype: 'video/mp4' },
        { filename: 'video<script>alert("xss")</script>.mp4', mimetype: 'video/mp4' },
        { filename: 'video\x00.mp4', mimetype: 'video/mp4' }
      ];

      // Act & Assert
      maliciousFiles.forEach(file => {
        const result = videoFileValidator.validateFileFormat(file.filename, file.mimetype);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Filename contains invalid characters.');
      });
    });
  });

  describe('validateFileSize', () => {
    it('should accept files within size limit', async () => {
      // Arrange
      const validSizes = [
        100000,     // 100KB
        10000000,   // 10MB
        100000000,  // 100MB
        524287999   // Just under 500MB
      ];

      // Act & Assert
      for (const size of validSizes) {
        mockStat.mockResolvedValue({ size } as any);
        
        const result = await videoFileValidator.validateFileSize('/path/to/video.mp4');
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.fileSizeBytes).toBe(size);
        expect(result.fileSizeMB).toBe(Math.round((size / (1024 * 1024)) * 100) / 100);
      }
    });

    it('should reject files exceeding size limit', async () => {
      // Arrange
      const oversizedFiles = [
        524288001,  // Just over 500MB
        600000000,  // 600MB
        1073741824  // 1GB
      ];

      // Act & Assert
      for (const size of oversizedFiles) {
        mockStat.mockResolvedValue({ size } as any);
        
        const result = await videoFileValidator.validateFileSize('/path/to/video.mp4');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('File size exceeds maximum limit of 500MB.');
        expect(result.fileSizeBytes).toBe(size);
      }
    });

    it('should reject zero-byte files', async () => {
      // Arrange
      mockStat.mockResolvedValue({ size: 0 } as any);

      // Act
      const result = await videoFileValidator.validateFileSize('/path/to/empty.mp4');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty (0 bytes).');
    });

    it('should handle file access errors', async () => {
      // Arrange
      mockStat.mockRejectedValue(new Error('File not found'));

      // Act
      const result = await videoFileValidator.validateFileSize('/path/to/nonexistent.mp4');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unable to access file for size validation.');
    });
  });

  describe('validateVideoDuration', () => {
    it('should accept videos within duration limit', async () => {
      // Arrange
      const validDurations = [30, 120, 180, 299]; // seconds

      // Act & Assert
      for (const duration of validDurations) {
        mockFFProbe.mockImplementation((_filePath: string, callback: any) => {
          callback(null, {
            format: { duration: duration.toString() }
          });
        });

        const result = await videoFileValidator.validateVideoDuration('/path/to/video.mp4');
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.durationSeconds).toBe(duration);
        expect(result.durationFormatted).toBe(videoFileValidator.formatDuration(duration));
      }
    });

    it('should reject videos exceeding duration limit', async () => {
      // Arrange
      const longDurations = [301, 400, 600, 3600]; // seconds

      // Act & Assert
      for (const duration of longDurations) {
        mockFFProbe.mockImplementation((_filePath: string, callback: any) => {
          callback(null, {
            format: { duration: duration.toString() }
          });
        });

        const result = await videoFileValidator.validateVideoDuration('/path/to/video.mp4');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Video duration exceeds maximum limit of 5 minutes (300 seconds).');
        expect(result.durationSeconds).toBe(duration);
      }
    });

    it('should handle FFmpeg probe errors', async () => {
      // Arrange
      mockFFProbe.mockImplementation((_filePath: string, callback: any) => {
        callback(new Error('Could not probe video file'));
      });

      // Act
      const result = await videoFileValidator.validateVideoDuration('/path/to/corrupted.mp4');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unable to determine video duration.');
    });

    it('should handle missing duration metadata', async () => {
      // Arrange
      mockFFProbe.mockImplementation((_filePath: string, callback: any) => {
        callback(null, {
          format: {} // No duration property
        });
      });

      // Act
      const result = await videoFileValidator.validateVideoDuration('/path/to/no-duration.mp4');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Video duration information not available.');
    });
  });

  describe('validateVideoFile', () => {
    it('should perform comprehensive validation for valid video', async () => {
      // Arrange
      const validFile = {
        filename: 'test-video.mp4',
        mimetype: 'video/mp4',
        path: '/path/to/test-video.mp4'
      };

      mockStat.mockResolvedValue({ size: 50000000 } as any); // 50MB
      mockFFProbe.mockImplementation((_filePath: string, callback: any) => {
        callback(null, {
          format: { duration: '180' } // 3 minutes
        });
      });

      // Act
      const result = await videoFileValidator.validateVideoFile(validFile);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fileInfo).toBeDefined();
      expect(result.fileInfo?.filename).toBe('test-video.mp4');
      expect(result.fileInfo?.format).toBe('mp4');
      expect(result.fileInfo?.sizeBytes).toBe(50000000);
      expect(result.fileInfo?.durationSeconds).toBe(180);
    });

    it('should aggregate all validation errors', async () => {
      // Arrange
      const invalidFile = {
        filename: '../malicious.mkv',
        mimetype: 'video/x-matroska',
        path: '/path/to/malicious.mkv'
      };

      mockStat.mockResolvedValue({ size: 600000000 } as any); // 600MB (over limit)
      mockFFProbe.mockImplementation((_filePath: string, callback: any) => {
        callback(null, {
          format: { duration: '400' } // 6+ minutes (over limit)
        });
      });

      // Act
      const result = await videoFileValidator.validateVideoFile(invalidFile);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
      expect(result.errors).toContain('Filename contains invalid characters.');
      expect(result.errors).toContain('Unsupported file format. Only MP4, MOV, and AVI files are allowed.');
      expect(result.errors).toContain('File size exceeds maximum limit of 500MB.');
      expect(result.errors).toContain('Video duration exceeds maximum limit of 5 minutes (300 seconds).');
    });
  });

  describe('formatDuration', () => {
    it('should format duration correctly', () => {
      // Arrange & Act & Assert
      expect(videoFileValidator.formatDuration(30)).toBe('0:30');
      expect(videoFileValidator.formatDuration(90)).toBe('1:30');
      expect(videoFileValidator.formatDuration(180)).toBe('3:00');
      expect(videoFileValidator.formatDuration(299)).toBe('4:59');
      expect(videoFileValidator.formatDuration(3661)).toBe('61:01'); // Over an hour
    });
  });

  describe('sanitizeFilename', () => {
    it('should sanitize malicious filename patterns', () => {
      // Arrange
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'file<script>alert("xss")</script>',
        'file\x00null',
        'CON.txt',  // Windows reserved name
        'PRN.mp4',  // Windows reserved name
        'file:with:colons',
        'file|with|pipes'
      ];

      // Act & Assert
      maliciousNames.forEach(name => {
        const sanitized = videoFileValidator.sanitizeFilename(name);
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('\x00');
        expect(sanitized).not.toContain(':');
        expect(sanitized).not.toContain('|');
      });
    });

    it('should preserve safe filename characters', () => {
      // Arrange
      const safeNames = [
        'my-video.mp4',
        'video_2024_01_15.mov',
        'Recovery Journey (Day 30).avi',
        'video-123.MP4'
      ];

      // Act & Assert
      safeNames.forEach(name => {
        const sanitized = videoFileValidator.sanitizeFilename(name);
        expect(sanitized.length).toBeGreaterThan(0);
        expect(sanitized).toMatch(/^[a-zA-Z0-9._\-\s()]+$/);
      });
    });
  });

  describe('getValidationRules', () => {
    it('should return comprehensive validation rules', () => {
      // Act
      const rules = videoFileValidator.getValidationRules();

      // Assert
      expect(rules.maxFileSizeBytes).toBe(524288000); // 500MB
      expect(rules.maxDurationSeconds).toBe(300); // 5 minutes
      expect(rules.supportedFormats).toEqual(['mp4', 'mov', 'avi']);
      expect(rules.supportedMimeTypes).toBeDefined();
      expect(rules.supportedMimeTypes.length).toBeGreaterThan(0);
    });
  });
});