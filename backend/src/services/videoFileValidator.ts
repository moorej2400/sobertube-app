/**
 * Video File Validator Service
 * Handles comprehensive validation of video files including format, size, and duration
 */

import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '../utils/logger';
import {
  VideoValidationResult,
  FileFormatValidationResult,
  FileSizeValidationResult,
  VideoDurationValidationResult,
  VideoFileInput,
  VideoFileInfo,
  VideoValidationRules
} from '../types/validation';

/**
 * Video file validator service
 */
export class VideoFileValidator {
  private readonly maxFileSizeBytes = 524288000; // 500MB
  private readonly maxDurationSeconds = 300; // 5 minutes
  private readonly supportedFormats = ['mp4', 'mov', 'avi'];
  
  private readonly supportedMimeTypes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-quicktime',
    'video/x-msvideo',
    'video/avi',
    'video/msvideo'
  ];

  private readonly formatMimeMap: Record<string, string[]> = {
    mp4: ['video/mp4', 'video/mpeg'],
    mov: ['video/quicktime', 'video/x-quicktime'],
    avi: ['video/x-msvideo', 'video/avi', 'video/msvideo']
  };

  private readonly forbiddenFilenamePatterns = [
    /\.\./,           // Path traversal
    /[<>:"|?*]/,      // Invalid filename characters
    /[\x00-\x1f]/,    // Control characters
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i, // Windows reserved names
    /\s+$/,           // Trailing whitespace
    /^\.+$/           // Only dots
  ];

  /**
   * Validates video file format and filename
   */
  validateFileFormat(filename: string, mimetype: string): FileFormatValidationResult {
    const errors: string[] = [];
    
    try {
      logger.debug('Validating file format', { filename, mimetype });

      // Check if file has extension
      const extension = path.extname(filename).toLowerCase().substring(1);
      if (!extension) {
        errors.push('File must have a valid extension.');
        return { isValid: false, errors };
      }

      // Check if format is supported
      if (!this.supportedFormats.includes(extension)) {
        errors.push('Unsupported file format. Only MP4, MOV, and AVI files are allowed.');
      }

      // Check if MIME type is supported
      if (!this.supportedMimeTypes.includes(mimetype)) {
        errors.push('Unsupported MIME type.');
      }

      // Check MIME type and extension compatibility
      const expectedMimeTypes = this.formatMimeMap[extension];
      if (expectedMimeTypes && !expectedMimeTypes.includes(mimetype)) {
        errors.push('File extension does not match MIME type.');
      }

      // Validate and sanitize filename
      const sanitizedFilename = this.sanitizeFilename(filename);
      if (this.hasInvalidFilenamePatterns(filename)) {
        errors.push('Filename contains invalid characters.');
      }

      return {
        isValid: errors.length === 0,
        errors,
        detectedFormat: extension,
        sanitizedFilename
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during format validation';
      logger.error('Error validating file format', { error: errorMessage, filename });
      
      return {
        isValid: false,
        errors: ['Error validating file format.']
      };
    }
  }

  /**
   * Validates video file size
   */
  async validateFileSize(filePath: string): Promise<FileSizeValidationResult> {
    const errors: string[] = [];
    
    try {
      logger.debug('Validating file size', { filePath });

      // Check if file exists and get stats
      const stats = await fs.promises.stat(filePath);
      const fileSizeBytes = stats.size;
      const fileSizeMB = Math.round((fileSizeBytes / (1024 * 1024)) * 100) / 100;

      // Check if file is empty
      if (fileSizeBytes === 0) {
        errors.push('File is empty (0 bytes).');
      }

      // Check if file exceeds size limit
      if (fileSizeBytes > this.maxFileSizeBytes) {
        errors.push('File size exceeds maximum limit of 500MB.');
      }

      return {
        isValid: errors.length === 0,
        errors,
        fileSizeBytes,
        fileSizeMB
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during size validation';
      logger.error('Error validating file size', { error: errorMessage, filePath });
      
      return {
        isValid: false,
        errors: ['Unable to access file for size validation.']
      };
    }
  }

  /**
   * Validates video duration using FFmpeg
   */
  async validateVideoDuration(filePath: string): Promise<VideoDurationValidationResult> {
    const errors: string[] = [];
    
    try {
      logger.debug('Validating video duration', { filePath });

      const duration = await this.getVideoDurationWithFFmpeg(filePath);
      
      if (duration === null) {
        errors.push('Video duration information not available.');
        return { isValid: false, errors };
      }

      // Check if duration exceeds limit
      if (duration > this.maxDurationSeconds) {
        errors.push('Video duration exceeds maximum limit of 5 minutes (300 seconds).');
      }

      return {
        isValid: errors.length === 0,
        errors,
        durationSeconds: duration,
        durationFormatted: this.formatDuration(duration)
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during duration validation';
      logger.error('Error validating video duration', { error: errorMessage, filePath });
      
      return {
        isValid: false,
        errors: ['Unable to determine video duration.']
      };
    }
  }

  /**
   * Performs comprehensive video file validation
   */
  async validateVideoFile(file: VideoFileInput): Promise<VideoValidationResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting comprehensive video validation', { 
        filename: file.filename, 
        mimetype: file.mimetype,
        path: file.path 
      });

      // Perform all validations
      const formatValidation = this.validateFileFormat(file.filename, file.mimetype);
      const sizeValidation = await this.validateFileSize(file.path);
      const durationValidation = await this.validateVideoDuration(file.path);

      // Aggregate all errors
      const allErrors = [
        ...formatValidation.errors,
        ...sizeValidation.errors,
        ...durationValidation.errors
      ];

      const isValid = allErrors.length === 0;

      // Create file info if validation passed
      let fileInfo: VideoFileInfo | undefined;
      if (isValid && formatValidation.sanitizedFilename && sizeValidation.fileSizeBytes !== undefined && 
          sizeValidation.fileSizeMB !== undefined && durationValidation.durationSeconds !== undefined &&
          durationValidation.durationFormatted !== undefined && formatValidation.detectedFormat) {
        
        fileInfo = {
          filename: file.filename,
          originalFilename: file.filename,
          sanitizedFilename: formatValidation.sanitizedFilename,
          format: formatValidation.detectedFormat,
          mimeType: file.mimetype,
          sizeBytes: sizeValidation.fileSizeBytes,
          sizeMB: sizeValidation.fileSizeMB,
          durationSeconds: durationValidation.durationSeconds,
          durationFormatted: durationValidation.durationFormatted,
          path: file.path,
          uploadedAt: new Date()
        };
      }

      const result: VideoValidationResult = {
        isValid,
        errors: allErrors,
        fileInfo,
        validationDetails: {
          formatValidation,
          sizeValidation,
          durationValidation
        }
      };

      const executionTime = Date.now() - startTime;
      logger.info('Video validation completed', { 
        filename: file.filename,
        isValid,
        errorCount: allErrors.length,
        executionTime 
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during validation';
      logger.error('Error during comprehensive video validation', { 
        error: errorMessage, 
        filename: file.filename 
      });
      
      return {
        isValid: false,
        errors: ['Validation process failed due to internal error.'],
        fileInfo: undefined,
        validationDetails: {
          formatValidation: { isValid: false, errors: [] },
          sizeValidation: { isValid: false, errors: [] },
          durationValidation: { isValid: false, errors: [] }
        }
      };
    }
  }

  /**
   * Gets video duration using FFmpeg probe
   */
  private async getVideoDurationWithFFmpeg(filePath: string): Promise<number | null> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }

        if (!metadata?.format?.duration) {
          resolve(null);
          return;
        }

        const durationStr = metadata.format.duration;
        const duration = typeof durationStr === 'string' ? parseFloat(durationStr) : durationStr;
        resolve(isNaN(duration) ? null : Math.round(duration));
      });
    });
  }

  /**
   * Formats duration in MM:SS format
   */
  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Sanitizes filename by removing/replacing unsafe characters
   */
  sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"|?*\x00-\x1f]/g, '') // Remove invalid characters
      .replace(/\.\./g, '')               // Remove path traversal
      .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/gi, 'FILE$2') // Replace reserved names
      .replace(/\s+$/, '')                // Remove trailing whitespace
      .replace(/^\.+/, '')                // Remove leading dots
      .substring(0, 255);                 // Limit length
  }

  /**
   * Checks if filename contains invalid patterns
   */
  private hasInvalidFilenamePatterns(filename: string): boolean {
    return this.forbiddenFilenamePatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Returns validation rules configuration
   */
  getValidationRules(): VideoValidationRules {
    return {
      maxFileSizeBytes: this.maxFileSizeBytes,
      maxFileSizeMB: Math.round(this.maxFileSizeBytes / (1024 * 1024)),
      maxDurationSeconds: this.maxDurationSeconds,
      maxDurationMinutes: Math.round(this.maxDurationSeconds / 60),
      supportedFormats: [...this.supportedFormats],
      supportedMimeTypes: [...this.supportedMimeTypes],
      allowedFilenamePattern: /^[a-zA-Z0-9._\-\s()]+$/,
      forbiddenFilenamePatterns: [...this.forbiddenFilenamePatterns]
    };
  }

  /**
   * Validates multiple video files in batch
   */
  async validateMultipleFiles(files: VideoFileInput[]): Promise<VideoValidationResult[]> {
    logger.info('Starting batch video validation', { fileCount: files.length });
    
    const results = await Promise.all(
      files.map(file => this.validateVideoFile(file))
    );
    
    const validCount = results.filter(r => r.isValid).length;
    logger.info('Batch video validation completed', { 
      total: files.length, 
      valid: validCount, 
      invalid: files.length - validCount 
    });
    
    return results;
  }

  /**
   * Quick format check without file system access
   */
  quickFormatCheck(filename: string, mimetype: string): boolean {
    const extension = path.extname(filename).toLowerCase().substring(1);
    return this.supportedFormats.includes(extension) && 
           this.supportedMimeTypes.includes(mimetype) &&
           !this.hasInvalidFilenamePatterns(filename);
  }
}