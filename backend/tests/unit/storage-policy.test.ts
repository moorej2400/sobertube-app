/**
 * Storage Policy Service Unit Tests
 * Tests for storage policy validation and enforcement logic
 */

import { StoragePolicyService } from '../../src/services/storagePolicy';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Storage Policy Service - Unit Tests', () => {
  let storagePolicyService: StoragePolicyService;

  beforeEach(() => {
    storagePolicyService = new StoragePolicyService();
  });

  describe('validateUserAccess', () => {
    describe('read operations', () => {
      it('should allow authenticated users to read any video', () => {
        // Arrange
        const userId = 'user-123';
        const videoPath = 'user-456/2024/01/video-789.mp4';

        // Act
        const result = storagePolicyService.validateUserAccess(userId, videoPath, 'read');

        // Assert
        expect(result).toBe(true);
      });

      it('should deny access to unauthenticated users', () => {
        // Arrange
        const userId = '';
        const videoPath = 'user-456/2024/01/video-789.mp4';

        // Act
        const result = storagePolicyService.validateUserAccess(userId, videoPath, 'read');

        // Assert
        expect(result).toBe(false);
      });
    });

    describe('write operations', () => {
      it('should allow users to write to their own folder', () => {
        // Arrange
        const userId = 'user-123';
        const videoPath = 'user-123/2024/01/video-456.mp4';

        // Act
        const result = storagePolicyService.validateUserAccess(userId, videoPath, 'write');

        // Assert
        expect(result).toBe(true);
      });

      it('should deny users from writing to other user folders', () => {
        // Arrange
        const userId = 'user-123';
        const videoPath = 'user-456/2024/01/video-789.mp4';

        // Act
        const result = storagePolicyService.validateUserAccess(userId, videoPath, 'write');

        // Assert
        expect(result).toBe(false);
      });

      it('should handle edge cases with user IDs', () => {
        // Arrange & Act & Assert
        expect(storagePolicyService.validateUserAccess('user-123', 'user-123/2024/01/video.mp4', 'write')).toBe(true);
        expect(storagePolicyService.validateUserAccess('user_123', 'user_123/2024/01/video.mp4', 'write')).toBe(true);
        expect(storagePolicyService.validateUserAccess('user-123', 'user_123/2024/01/video.mp4', 'write')).toBe(false);
      });
    });

    describe('delete operations', () => {
      it('should allow users to delete their own files', () => {
        // Arrange
        const userId = 'user-123';
        const videoPath = 'user-123/2024/01/video-456.mp4';

        // Act
        const result = storagePolicyService.validateUserAccess(userId, videoPath, 'delete');

        // Assert
        expect(result).toBe(true);
      });

      it('should deny users from deleting other user files', () => {
        // Arrange
        const userId = 'user-123';
        const videoPath = 'user-456/2024/01/video-789.mp4';

        // Act
        const result = storagePolicyService.validateUserAccess(userId, videoPath, 'delete');

        // Assert
        expect(result).toBe(false);
      });
    });

    describe('error handling', () => {
      it('should handle invalid paths gracefully', () => {
        // Arrange
        const userId = 'user-123';
        const invalidPaths = ['', '/', 'invalid', null as any, undefined as any];

        // Act & Assert
        invalidPaths.forEach(path => {
          expect(storagePolicyService.validateUserAccess(userId, path, 'write')).toBe(false);
        });
      });

      it('should handle invalid operations', () => {
        // Arrange
        const userId = 'user-123';
        const videoPath = 'user-123/2024/01/2024/01/video.mp4';

        // Act & Assert
        expect(storagePolicyService.validateUserAccess(userId, videoPath, 'invalid' as any)).toBe(false);
      });
    });
  });

  describe('validatePathStructure', () => {
    it('should validate correct path structures', () => {
      // Arrange
      const validPaths = [
        'user-123/2024/01/video-456.mp4',
        'user_123/2024/12/video_456.mov',
        'user123/2024/01/video789.avi',
        'a/2024/01/a.mp4',
        'user-with-dashes/2024/01/video-with-dashes.MP4'
      ];

      // Act & Assert
      validPaths.forEach(path => {
        expect(storagePolicyService.validatePathStructure(path)).toBe(true);
      });
    });
    it("should reject invalid path structures", () => {
      // Arrange
      const invalidPaths = [
        "user/video.mp4", // Missing year/month
        "user/2024/video.mp4", // Missing month
        "user/24/01/video.mp4", // Invalid year format
        "user/2024/1/video.mp4", // Invalid month format
        "user/2024/01/video.txt", // Invalid extension
        "user/2024/01/video.mkv", // Unsupported format
        "", // Empty path
        "user/2024/01/", // Missing filename
        "/2024/01/video.mp4", // Missing user
        "user/2024/01/video", // Missing extension
        "user/2024/13/video.mp4", // Invalid month (13)
        "user/2024/00/video.mp4" // Invalid month (00)
      ];

      // Act & Assert
      invalidPaths.forEach(path => {
        expect(storagePolicyService.validatePathStructure(path)).toBe(false);
      });
    });

    it('should handle different file extension cases', () => {
      // Arrange
      const pathsWithDifferentCases = [
        'user/2024/01/video.mp4',
        'user/2024/01/video.MP4',
        'user/2024/01/video.Mp4',
        'user/2024/01/video.MOV',
        'user/2024/01/video.AVI'
      ];

      // Act & Assert
      pathsWithDifferentCases.forEach(path => {
        expect(storagePolicyService.validatePathStructure(path)).toBe(true);
      });
    });
  });

  describe('getStoragePolicyDefinitions', () => {
    it('should return correct policy definitions', () => {
      // Act
      const policies = storagePolicyService.getStoragePolicyDefinitions();

      // Assert
      expect(policies).toHaveLength(4);
      expect(policies.map(p => p.name)).toEqual([
        'video_upload_policy',
        'video_read_policy',
        'video_update_policy',
        'video_delete_policy'
      ]);
      expect(policies.map(p => p.operation)).toEqual([
        'INSERT',
        'SELECT',
        'UPDATE',
        'DELETE'
      ]);
    });

    it('should have valid policy definitions', () => {
      // Act
      const policies = storagePolicyService.getStoragePolicyDefinitions();

      // Assert
      policies.forEach(policy => {
        expect(policy.name).toBeTruthy();
        expect(policy.operation).toBeTruthy();
        expect(policy.target).toBe('objects');
        expect(policy.definition).toBeTruthy();
        expect(policy.description).toBeTruthy();
      });
    });
  });

  describe('generatePolicySQL', () => {
    it('should generate valid SQL statements', () => {
      // Act
      const sqlStatements = storagePolicyService.generatePolicySQL();

      // Assert
      expect(sqlStatements).toHaveLength(4);
      sqlStatements.forEach(sql => {
        expect(sql).toContain('CREATE POLICY');
        expect(sql).toContain('ON storage.objects');
        expect(sql).toContain('FOR');
        expect(sql).toContain('USING');
        expect(sql).toContain('-- Comment:');
      });
    });

    it('should generate SQL with correct policy names', () => {
      // Act
      const sqlStatements = storagePolicyService.generatePolicySQL();

      // Assert
      expect(sqlStatements[0]).toContain('"video_upload_policy"');
      expect(sqlStatements[1]).toContain('"video_read_policy"');
      expect(sqlStatements[2]).toContain('"video_update_policy"');
      expect(sqlStatements[3]).toContain('"video_delete_policy"');
    });
  });

  describe('testPolicyEnforcement', () => {
    it('should run all policy enforcement tests', async () => {
      // Act
      const result = await storagePolicyService.testPolicyEnforcement();

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.results).toHaveLength(4);
      expect(result.data?.summary.totalTests).toBe(4);
      expect(result.data?.summary.passed).toBe(4);
      expect(result.data?.summary.failed).toBe(0);
    });

    it('should correctly test user access scenarios', async () => {
      // Act
      const result = await storagePolicyService.testPolicyEnforcement();

      // Assert
      const results = result.data?.results;
      expect(results[0].name).toBe('User can access own files');
      expect(results[0].passed).toBe(true);
      
      expect(results[1].name).toBe('User cannot access other user files');
      expect(results[1].passed).toBe(true);
      
      expect(results[2].name).toBe('Public read access works');
      expect(results[2].passed).toBe(true);
      
      expect(results[3].name).toBe('Invalid path structure rejected');
      expect(results[3].passed).toBe(true);
    });
  });

  describe('getBucketPolicyConfig', () => {
    it('should return correct bucket policy configuration', () => {
      // Act
      const config = storagePolicyService.getBucketPolicyConfig();

      // Assert
      expect(config.bucketName).toBe('sobertube-videos');
      expect(config.publicReadAccess).toBe(true);
      expect(config.userSpecificWrite).toBe(true);
      expect(config.pathStructure).toBe('user_id/year/month/video_id.ext');
      expect(config.supportedOperations).toContain('SELECT');
      expect(config.supportedOperations).toContain('INSERT');
      expect(config.supportedOperations).toContain('UPDATE');
      expect(config.supportedOperations).toContain('DELETE');
      expect(config.authentication).toBe('required');
    });
  });
});