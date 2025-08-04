/**
 * Storage Policy Service
 * Handles Supabase storage bucket policies and permissions for video files
 */

import { getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';

interface PolicyResult {
  success: boolean;
  error?: string;
  data?: any;
}

interface TestScenario {
  name: string;
  userId: string;
  path: string;
  operation: 'read' | 'write' | 'delete';
  expectedResult: boolean;
}

interface TestResult extends TestScenario {
  actualResult: boolean;
  passed: boolean;
  accessResult: boolean;
  pathValid: boolean;
}

export class StoragePolicyService {
  private readonly bucketName = 'sobertube-videos';

  /**
   * Create RLS policies for video storage bucket
   * These policies control who can upload, read, and delete video files
   */
  async createStoragePolicies(): Promise<PolicyResult> {
    try {
      // Note: Supabase client would be used for actual policy creation in production
      getSupabaseClient();
      
      const policies = this.getStoragePolicyDefinitions();
      
      logger.info('Storage policies defined for video bucket', {
        bucketName: this.bucketName,
        policiesCount: policies.length
      });

      return {
        success: true,
        data: {
          policies,
          bucketName: this.bucketName,
          message: 'Storage policies are defined and ready for implementation'
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create storage policies', {
        bucketName: this.bucketName,
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get storage policy definitions for the video bucket
   * These would be applied via SQL or Supabase dashboard
   */
  getStoragePolicyDefinitions() {
    return [
      {
        name: 'video_upload_policy',
        operation: 'INSERT',
        target: 'objects',
        definition: 'bucket_id = \'sobertube-videos\' AND auth.uid()::text = (storage.foldername(name))[1]',
        description: 'Users can only upload to their own folder (user_id/year/month/video_id.ext)'
      },
      {
        name: 'video_read_policy',
        operation: 'SELECT',
        target: 'objects',
        definition: 'bucket_id = \'sobertube-videos\'',
        description: 'Public read access for video streaming'
      },
      {
        name: 'video_update_policy',
        operation: 'UPDATE',
        target: 'objects',
        definition: 'bucket_id = \'sobertube-videos\' AND auth.uid()::text = (storage.foldername(name))[1]',
        description: 'Users can only update their own video files'
      },
      {
        name: 'video_delete_policy',
        operation: 'DELETE',
        target: 'objects',
        definition: 'bucket_id = \'sobertube-videos\' AND auth.uid()::text = (storage.foldername(name))[1]',
        description: 'Users can only delete their own video files'
      }
    ];
  }

  /**
   * Validate if a user can access a specific video path
   */
  validateUserAccess(userId: string, videoPath: string, operation: 'read' | 'write' | 'delete'): boolean {
    try {
      // First validate path structure for security
      if (!this.validatePathStructure(videoPath)) {
        return false;
      }

      // Extract user ID from path (format: user_id/year/month/video_id.ext)
      const pathParts = videoPath.split('/');
      if (pathParts.length < 1) {
        return false;
      }

      const pathUserId = pathParts[0];

      switch (operation) {
        case 'read':
          // Public read access for all authenticated users (with valid paths)
          return !!userId;
          
        case 'write':
        case 'delete':
          // Users can only write/delete their own files (with valid paths)
          return userId === pathUserId;
          
        default:
          return false;
      }
    } catch (error) {
      logger.error('Error validating user access', {
        userId,
        videoPath,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Check if a file path follows the required naming convention
   */
  validatePathStructure(filePath: string): boolean {
    // Additional security check for path traversal
    if (filePath.includes('..') || filePath.includes('//') || filePath.includes('\\')) {
      return false;
    }
    
    // Expected format: user_id/year/month/video_id.ext (strict month validation)
    const pathRegex = /^[a-zA-Z0-9_-]+\/\d{4}\/(0[1-9]|1[0-2])\/[a-zA-Z0-9_-]+\.(mp4|mov|avi)$/i;
    return pathRegex.test(filePath);
  }

  /**
   * Generate SQL statements for creating the storage policies
   * These would be executed in Supabase SQL editor or migration
   */
  generatePolicySQL(): string[] {
    const policies = this.getStoragePolicyDefinitions();
    
    return policies.map(policy => {
      return `
-- Create ${policy.name} for ${policy.operation} operations
CREATE POLICY "${policy.name}" ON storage.objects
FOR ${policy.operation} USING (${policy.definition});

-- Comment: ${policy.description}
`.trim();
    });
  }

  /**
   * Test policy enforcement with mock scenarios
   */
  async testPolicyEnforcement(): Promise<PolicyResult> {
    try {
      const testScenarios: TestScenario[] = [
        {
          name: 'User can access own files',
          userId: 'user-123',
          path: 'user-123/2024/01/video-456.mp4',
          operation: 'write',
          expectedResult: true
        },
        {
          name: 'User cannot access other user files',
          userId: 'user-123',
          path: 'user-456/2024/01/video-789.mp4',
          operation: 'write',
          expectedResult: false
        },
        {
          name: 'Public read access works',
          userId: 'user-123',
          path: 'user-456/2024/01/video-789.mp4',
          operation: 'read',
          expectedResult: true
        },
        {
          name: 'Invalid path structure rejected',
          userId: 'user-123',
          path: 'invalid/path.mp4',
          operation: 'write',
          expectedResult: false
        }
      ];

      const results: TestResult[] = testScenarios.map(scenario => {
        const accessResult = this.validateUserAccess(scenario.userId, scenario.path, scenario.operation);
        const pathValid = this.validatePathStructure(scenario.path);
        const overallResult = accessResult && pathValid;
        
        return {
          ...scenario,
          actualResult: overallResult,
          passed: overallResult === scenario.expectedResult,
          accessResult,
          pathValid
        };
      });

      const allPassed = results.every(result => result.passed);
      
      logger.info('Policy enforcement test completed', {
        totalTests: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        allPassed
      });

      return {
        success: allPassed,
        data: {
          results,
          summary: {
            totalTests: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length
          }
        },
        ...(allPassed ? {} : { error: 'Some policy enforcement tests failed' })
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Policy enforcement test failed', {
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get bucket configuration for policy setup
   */
  getBucketPolicyConfig() {
    return {
      bucketName: this.bucketName,
      publicReadAccess: true,
      userSpecificWrite: true,
      pathStructure: 'user_id/year/month/video_id.ext',
      supportedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      authentication: 'required'
    };
  }
}

// Export singleton instance
export const storagePolicyService = new StoragePolicyService();