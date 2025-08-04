/**
 * Video Validation Types
 * Type definitions for video file validation operations
 */

/**
 * Video validation error types
 */
export type VideoValidationError = 
  | 'INVALID_FORMAT'
  | 'INVALID_MIME_TYPE'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'DURATION_TOO_LONG'
  | 'DURATION_UNAVAILABLE'
  | 'FILENAME_INVALID'
  | 'FILE_ACCESS_ERROR'
  | 'MIME_EXTENSION_MISMATCH';

/**
 * Basic validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * File format validation result
 */
export interface FileFormatValidationResult extends ValidationResult {
  detectedFormat?: string;
  sanitizedFilename?: string;
}

/**
 * File size validation result
 */
export interface FileSizeValidationResult extends ValidationResult {
  fileSizeBytes?: number;
  fileSizeMB?: number;
}

/**
 * Video duration validation result
 */
export interface VideoDurationValidationResult extends ValidationResult {
  durationSeconds?: number;
  durationFormatted?: string;
}

/**
 * Video file information
 */
export interface VideoFileInfo {
  filename: string;
  originalFilename: string;
  sanitizedFilename: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
  sizeMB: number;
  durationSeconds: number;
  durationFormatted: string;
  path: string;
  uploadedAt: Date;
}

/**
 * Comprehensive video validation result
 */
export interface VideoValidationResult extends ValidationResult {
  fileInfo: VideoFileInfo | undefined;
  validationDetails: {
    formatValidation: FileFormatValidationResult;
    sizeValidation: FileSizeValidationResult;
    durationValidation: VideoDurationValidationResult;
  };
}

/**
 * Video file input for validation
 */
export interface VideoFileInput {
  filename: string;
  mimetype: string;
  path: string;
  size?: number;
}

/**
 * Video validation rules configuration
 */
export interface VideoValidationRules {
  maxFileSizeBytes: number;
  maxFileSizeMB: number;
  maxDurationSeconds: number;
  maxDurationMinutes: number;
  supportedFormats: string[];
  supportedMimeTypes: string[];
  allowedFilenamePattern: RegExp;
  forbiddenFilenamePatterns: RegExp[];
}

/**
 * Video validation error details
 */
export interface VideoValidationErrorDetail {
  code: VideoValidationError;
  message: string;
  field: string;
  value?: any;
  suggestion?: string;
}

/**
 * Bulk video validation result
 */
export interface BulkVideoValidationResult {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  results: Array<{
    filename: string;
    isValid: boolean;
    errors: string[];
  }>;
  summary: {
    totalSizeBytes: number;
    totalDurationSeconds: number;
    formatDistribution: Record<string, number>;
  };
}

/**
 * Video processing metadata
 */
export interface VideoProcessingMetadata {
  originalFilename: string;
  processedFilename: string;
  thumbnailPath?: string;
  previewPath?: string;
  processingStarted: Date;
  processingCompleted?: Date;
  processingDuration?: number;
  quality: 'original' | 'high' | 'medium' | 'low';
  resolution?: {
    width: number;
    height: number;
  };
  bitrate?: number;
  frameRate?: number;
  audioChannels?: number;
}