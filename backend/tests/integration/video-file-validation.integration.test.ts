/**
 * Video File Validation Integration Tests
 * Tests video file validation with real file system operations and FFmpeg
 */

import { VideoFileValidator } from '../../src/services/videoFileValidator';
import { VideoFileInput } from '../../src/types/validation';
import fs from 'fs';
import path from 'path';

describe('Video File Validation Integration Tests', () => {
  let videoFileValidator: VideoFileValidator;
  const testFilesDir = path.join(__dirname, '../fixtures/test-files');
  
  beforeAll(async () => {
    videoFileValidator = new VideoFileValidator();
    
    // Create test files directory if it doesn't exist
    await fs.promises.mkdir(testFilesDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test files
    try {
      const files = await fs.promises.readdir(testFilesDir);
      await Promise.all(
        files.map(file => 
          fs.promises.unlink(path.join(testFilesDir, file)).catch(() => {})
        )
      );
      await fs.promises.rmdir(testFilesDir).catch(() => {});
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Real File System Integration', () => {
    let testVideoFile: string;
    let oversizedFile: string;
    let emptyFile: string;

    beforeEach(async () => {
      // Create test files for validation
      testVideoFile = path.join(testFilesDir, 'test-video.mp4');
      oversizedFile = path.join(testFilesDir, 'oversized-video.mp4');
      emptyFile = path.join(testFilesDir, 'empty-video.mp4');

      // Create a small test file (simulating MP4)
      await fs.promises.writeFile(testVideoFile, Buffer.alloc(1024 * 1024, 0)); // 1MB

      // Create oversized file (simulating >500MB)
      // Note: In real tests, we'd want to create a smaller file and mock the size check
      // For integration testing, we'll create a 1MB file and test the logic
      await fs.promises.writeFile(oversizedFile, Buffer.alloc(1024 * 1024, 0)); // 1MB (we'll mock the size)

      // Create empty file
      await fs.promises.writeFile(emptyFile, '');
    });

    afterEach(async () => {
      // Clean up test files
      const files = [testVideoFile, oversizedFile, emptyFile];
      await Promise.all(
        files.map(file => 
          fs.promises.unlink(file).catch(() => {})
        )
      );
    });

    it('should validate file size correctly for real files', async () => {
      // Act
      const result = await videoFileValidator.validateFileSize(testVideoFile);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.fileSizeBytes).toBe(1024 * 1024); // 1MB
      expect(result.fileSizeMB).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty files correctly', async () => {
      // Act
      const result = await videoFileValidator.validateFileSize(emptyFile);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.fileSizeBytes).toBe(0);
      expect(result.fileSizeMB).toBe(0);
      expect(result.errors).toContain('File is empty (0 bytes).');
    });

    it('should handle non-existent files gracefully', async () => {
      // Act
      const result = await videoFileValidator.validateFileSize('/path/to/nonexistent.mp4');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unable to access file for size validation.');
    });
  });

  describe('Format Validation Integration', () => {
    it('should validate various video formats and MIME types', () => {
      // Arrange
      const testCases = [
        // Valid combinations
        { filename: 'video.mp4', mimetype: 'video/mp4', shouldPass: true },
        { filename: 'video.MP4', mimetype: 'video/mp4', shouldPass: true },
        { filename: 'movie.mov', mimetype: 'video/quicktime', shouldPass: true },
        { filename: 'clip.avi', mimetype: 'video/x-msvideo', shouldPass: true },
        
        // Invalid combinations
        { filename: 'video.mp4', mimetype: 'video/quicktime', shouldPass: false },
        { filename: 'video.mkv', mimetype: 'video/x-matroska', shouldPass: false },
        { filename: 'audio.mp3', mimetype: 'audio/mpeg', shouldPass: false },
        { filename: 'document.pdf', mimetype: 'application/pdf', shouldPass: false },
        
        // Edge cases
        { filename: 'video', mimetype: 'video/mp4', shouldPass: false }, // No extension
        { filename: '', mimetype: 'video/mp4', shouldPass: false }, // Empty filename
      ];

      // Act & Assert
      testCases.forEach(({ filename, mimetype, shouldPass }) => {
        const result = videoFileValidator.validateFileFormat(filename, mimetype);
        expect(result.isValid).toBe(shouldPass);
        
        if (shouldPass) {
          expect(result.errors).toHaveLength(0);
          expect(result.detectedFormat).toBeDefined();
          expect(result.sanitizedFilename).toBeDefined();
        } else {
          expect(result.errors.length).toBeGreaterThan(0);
        }
      });
    });

    it('should sanitize various malicious filename patterns', () => {
      // Arrange
      const maliciousFilenames = [
        '../../../etc/passwd.mp4',
        '..\\..\\..\\windows\\system32.mp4',
        'video<script>alert("xss")</script>.mp4',
        'video\x00null.mp4',
        'CON.mp4',
        'PRN.mov',
        'file:with:colons.avi',
        'file|with|pipes.mp4'
      ];

      // Act & Assert
      maliciousFilenames.forEach(filename => {
        const result = videoFileValidator.validateFileFormat(filename, 'video/mp4');
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Filename contains invalid characters.');
        
        const sanitized = videoFileValidator.sanitizeFilename(filename);
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('\x00');
      });
    });
  });

  describe('Duration Validation Integration', () => {
    // Note: These tests would require actual video files with different durations
    // For now, we test the error handling and edge cases

    it('should handle missing video files gracefully', async () => {
      // Act
      const result = await videoFileValidator.validateVideoDuration('/path/to/nonexistent.mp4');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unable to determine video duration.');
    });

    it('should handle corrupted video files gracefully', async () => {
      // Arrange - Create a text file with .mp4 extension (corrupted video)
      const corruptedFile = path.join(testFilesDir, 'corrupted.mp4');
      await fs.promises.writeFile(corruptedFile, 'This is not a video file');

      try {
        // Act
        const result = await videoFileValidator.validateVideoDuration(corruptedFile);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Unable to determine video duration.');
      } finally {
        // Cleanup
        await fs.promises.unlink(corruptedFile).catch(() => {});
      }
    });
  });

  describe('Comprehensive File Validation Integration', () => {
    it('should perform end-to-end validation with real file', async () => {
      // Arrange
      const testFile = path.join(testFilesDir, 'integration-test.mp4');
      await fs.promises.writeFile(testFile, Buffer.alloc(1024 * 100, 0)); // 100KB

      const fileInput: VideoFileInput = {
        filename: 'integration-test.mp4',
        mimetype: 'video/mp4',
        path: testFile
      };

      try {
        // Act
        const result = await videoFileValidator.validateVideoFile(fileInput);

        // Assert
        expect(result.validationDetails).toBeDefined();
        expect(result.validationDetails.formatValidation.isValid).toBe(true);
        expect(result.validationDetails.sizeValidation.isValid).toBe(true);
        
        // Duration validation will fail because it's not a real video file, but that's expected
        expect(result.validationDetails.durationValidation.isValid).toBe(false);
        
        // Overall result should be false due to duration validation failure
        expect(result.isValid).toBe(false);
        
        // File info should not be populated due to validation failure
        expect(result.fileInfo).toBeUndefined();

      } finally {
        // Cleanup
        await fs.promises.unlink(testFile).catch(() => {});
      }
    });

    it('should handle multiple validation errors correctly', async () => {
      // Arrange
      const testFile = path.join(testFilesDir, '../malicious.mkv');
      // Don't create the file to test file access error as well

      const fileInput: VideoFileInput = {
        filename: '../malicious.mkv',
        mimetype: 'video/x-matroska',
        path: testFile
      };

      // Act
      const result = await videoFileValidator.validateVideoFile(fileInput);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
      expect(result.errors).toContain('Filename contains invalid characters.');
      expect(result.errors).toContain('Unsupported file format. Only MP4, MOV, and AVI files are allowed.');
      expect(result.errors).toContain('Unable to access file for size validation.');
      expect(result.errors).toContain('Unable to determine video duration.');
    });
  });

  describe('Validation Rules Integration', () => {
    it('should provide consistent validation rules', () => {
      // Act
      const rules = videoFileValidator.getValidationRules();

      // Assert
      expect(rules.maxFileSizeBytes).toBe(524288000); // 500MB
      expect(rules.maxFileSizeMB).toBe(500);
      expect(rules.maxDurationSeconds).toBe(300); // 5 minutes
      expect(rules.maxDurationMinutes).toBe(5);
      
      expect(rules.supportedFormats).toEqual(['mp4', 'mov', 'avi']);
      expect(rules.supportedMimeTypes).toContain('video/mp4');
      expect(rules.supportedMimeTypes).toContain('video/quicktime');
      expect(rules.supportedMimeTypes).toContain('video/x-msvideo');
      
      expect(rules.allowedFilenamePattern).toBeInstanceOf(RegExp);
      expect(rules.forbiddenFilenamePatterns).toBeInstanceOf(Array);
      expect(rules.forbiddenFilenamePatterns.every(p => p instanceof RegExp)).toBe(true);
    });
  });

  describe('Batch Validation Integration', () => {
    it('should validate multiple files efficiently', async () => {
      // Arrange
      const testFiles = [
        { filename: 'video1.mp4', mimetype: 'video/mp4' },
        { filename: 'video2.mov', mimetype: 'video/quicktime' },
        { filename: 'invalid.mkv', mimetype: 'video/x-matroska' }
      ];

      const fileInputs: VideoFileInput[] = testFiles.map(file => ({
        ...file,
        path: path.join(testFilesDir, file.filename)
      }));

      // Create test files
      await Promise.all(
        fileInputs.slice(0, 2).map(input => 
          fs.promises.writeFile(input.path, Buffer.alloc(1024, 0))
        )
      );

      try {
        // Act
        const startTime = Date.now();
        const results = await videoFileValidator.validateMultipleFiles(fileInputs);
        const executionTime = Date.now() - startTime;

        // Assert
        expect(results).toHaveLength(3);
        expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
        
        // First two should have partial success (format and size OK, duration likely to fail)
        expect(results[0].validationDetails.formatValidation.isValid).toBe(true);
        expect(results[1].validationDetails.formatValidation.isValid).toBe(true);
        
        // Third should fail format validation
        expect(results[2].validationDetails.formatValidation.isValid).toBe(false);

      } finally {
        // Cleanup
        await Promise.all(
          fileInputs.map(input => 
            fs.promises.unlink(input.path).catch(() => {})
          )
        );
      }
    });
  });

  describe('Quick Format Check Integration', () => {
    it('should perform fast format validation without file system access', () => {
      // Arrange
      const testCases = [
        { filename: 'video.mp4', mimetype: 'video/mp4', expected: true },
        { filename: 'video.mov', mimetype: 'video/quicktime', expected: true },
        { filename: 'video.avi', mimetype: 'video/x-msvideo', expected: true },
        { filename: 'video.mkv', mimetype: 'video/x-matroska', expected: false },
        { filename: '../malicious.mp4', mimetype: 'video/mp4', expected: false },
        { filename: 'video', mimetype: 'video/mp4', expected: false }
      ];

      // Act & Assert
      testCases.forEach(({ filename, mimetype, expected }) => {
        const startTime = Date.now();
        const result = videoFileValidator.quickFormatCheck(filename, mimetype);
        const executionTime = Date.now() - startTime;
        
        expect(result).toBe(expected);
        expect(executionTime).toBeLessThan(10); // Should be very fast (< 10ms)
      });
    });
  });

  describe('Duration Formatting Integration', () => {
    it('should format durations consistently', () => {
      // Arrange
      const testCases = [
        { seconds: 0, expected: '0:00' },
        { seconds: 30, expected: '0:30' },
        { seconds: 60, expected: '1:00' },
        { seconds: 90, expected: '1:30' },
        { seconds: 300, expected: '5:00' }, // Max allowed
        { seconds: 3661, expected: '61:01' } // Over an hour
      ];

      // Act & Assert
      testCases.forEach(({ seconds, expected }) => {
        const result = videoFileValidator.formatDuration(seconds);
        expect(result).toBe(expected);
      });
    });
  });
});