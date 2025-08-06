/**
 * Notification Template Service Unit Tests
 * Tests for notification templates, customization, localization, and personalization
 */

import { NotificationTemplateService } from '../../src/services/notificationTemplateService';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger');

describe('NotificationTemplateService', () => {
  let templateService: NotificationTemplateService;

  beforeEach(() => {
    jest.clearAllMocks();
    templateService = new NotificationTemplateService();
  });

  describe('Template Registration and Management', () => {
    it('should register notification templates', () => {
      const template = {
        id: 'like_notification',
        type: 'like',
        title: {
          en: '{{username}} liked your {{contentType}}',
          es: '{{username}} le gustó tu {{contentType}}',
          fr: '{{username}} a aimé votre {{contentType}}'
        },
        body: {
          en: 'Your {{contentType}} "{{contentTitle}}" received a like from {{username}}',
          es: 'Tu {{contentType}} "{{contentTitle}}" recibió un me gusta de {{username}}',
          fr: 'Votre {{contentType}} "{{contentTitle}}" a reçu un j\'aime de {{username}}'
        },
        data: {
          actionType: 'like',
          contentId: '{{contentId}}',
          userId: '{{userId}}'
        },
        priority: 'normal',
        sound: 'default',
        icon: 'like_icon'
      };

      templateService.registerTemplate(template);

      const retrieved = templateService.getTemplate('like_notification');
      expect(retrieved).toEqual(template);
    });

    it('should handle template registration errors for duplicate IDs', () => {
      const template1 = {
        id: 'duplicate_test',
        type: 'test',
        title: { en: 'Test 1' },
        body: { en: 'Body 1' }
      };
      
      const template2 = {
        id: 'duplicate_test',
        type: 'test',
        title: { en: 'Test 2' },
        body: { en: 'Body 2' }
      };

      templateService.registerTemplate(template1);
      
      expect(() => templateService.registerTemplate(template2)).toThrow('Template with ID duplicate_test already exists');
    });

    it('should get template by ID', () => {
      const template = {
        id: 'comment_notification',
        type: 'comment',
        title: { en: 'New comment on your post' },
        body: { en: '{{username}} commented: {{commentPreview}}' }
      };

      templateService.registerTemplate(template);
      const retrieved = templateService.getTemplate('comment_notification');
      
      expect(retrieved).toEqual(template);
    });

    it('should return undefined for non-existent template', () => {
      const result = templateService.getTemplate('non_existent_template');
      expect(result).toBeUndefined();
    });

    it('should list all registered templates', () => {
      const template1 = {
        id: 'template_1',
        type: 'like',
        title: { en: 'Template 1' },
        body: { en: 'Body 1' }
      };
      
      const template2 = {
        id: 'template_2',
        type: 'comment',
        title: { en: 'Template 2' },
        body: { en: 'Body 2' }
      };

      templateService.registerTemplate(template1);
      templateService.registerTemplate(template2);

      const templates = templateService.getAllTemplates();
      expect(templates).toHaveLength(2);
      expect(templates.find(t => t.id === 'template_1')).toEqual(template1);
      expect(templates.find(t => t.id === 'template_2')).toEqual(template2);
    });
  });

  describe('Template Rendering and Personalization', () => {
    beforeEach(() => {
      // Register test templates
      templateService.registerTemplate({
        id: 'like_post',
        type: 'like',
        title: {
          en: '{{username}} liked your {{contentType}}',
          es: 'A {{username}} le gustó tu {{contentType}}'
        },
        body: {
          en: 'Your {{contentType}} "{{contentTitle}}" received a like from {{username}}',
          es: 'Tu {{contentType}} "{{contentTitle}}" recibió un me gusta de {{username}}'
        },
        data: {
          postId: '{{contentId}}',
          likerId: '{{userId}}'
        }
      });

      templateService.registerTemplate({
        id: 'milestone_reminder',
        type: 'milestone',
        title: {
          en: 'Congratulations on {{days}} days sober!',
          es: '¡Felicidades por {{days}} días sobrio!'
        },
        body: {
          en: 'You\'ve reached {{days}} days of sobriety. Keep up the amazing work!',
          es: '¡Has alcanzado {{days}} días de sobriedad. ¡Sigue con el increíble trabajo!'
        },
        data: {
          milestoneType: 'days',
          count: '{{days}}'
        }
      });
    });

    it('should render template with variables', () => {
      const variables = {
        username: 'John Doe',
        contentType: 'post',
        contentTitle: 'My Recovery Journey',
        contentId: 'post-123',
        userId: 'user-456'
      };

      const result = templateService.renderTemplate('like_post', variables, 'en');

      expect(result).toEqual({
        title: 'John Doe liked your post',
        body: 'Your post "My Recovery Journey" received a like from John Doe',
        data: {
          postId: 'post-123',
          likerId: 'user-456'
        }
      });
    });

    it('should render template with different language', () => {
      const variables = {
        username: 'María García',
        contentType: 'publicación'
      };

      const result = templateService.renderTemplate('like_post', variables, 'es');

      expect(result.title).toBe('A María García le gustó tu publicación');
    });

    it('should fallback to English if requested language not available', () => {
      const variables = {
        username: 'John Doe',
        contentType: 'post'
      };

      const result = templateService.renderTemplate('like_post', variables, 'de'); // German not available

      expect(result.title).toBe('John Doe liked your post'); // Falls back to English
      expect(logger.warn).toHaveBeenCalledWith('Language de not available for template like_post, falling back to English');
    });

    it('should handle missing variables gracefully', () => {
      const variables = {
        username: 'John Doe',
        // Missing contentType and contentTitle
        contentId: 'post-123',
        userId: 'user-456'
      };

      const result = templateService.renderTemplate('like_post', variables, 'en');

      expect(result.title).toBe('John Doe liked your {{contentType}}');
      expect(result.body).toContain('{{contentTitle}}'); // Missing variables remain as placeholders
    });

    it('should render milestone notifications correctly', () => {
      const variables = {
        days: 30
      };

      const result = templateService.renderTemplate('milestone_reminder', variables, 'en');

      expect(result.title).toBe('Congratulations on 30 days sober!');
      expect(result.body).toBe('You\'ve reached 30 days of sobriety. Keep up the amazing work!');
      expect(result.data).toEqual({
        milestoneType: 'days',
        count: '30'
      });
    });

    it('should handle complex variable substitutions', () => {
      templateService.registerTemplate({
        id: 'complex_template',
        type: 'test',
        title: {
          en: '{{user.firstName}} {{user.lastName}} from {{user.location.city}}'
        },
        body: {
          en: 'Progress: {{stats.daysClean}}/{{stats.goalDays}} days ({{progress}}%)'
        }
      });

      const variables = {
        'user.firstName': 'Sarah',
        'user.lastName': 'Johnson', 
        'user.location.city': 'Denver',
        'stats.daysClean': 45,
        'stats.goalDays': 90,
        progress: 50
      };

      const result = templateService.renderTemplate('complex_template', variables, 'en');

      expect(result.title).toBe('Sarah Johnson from Denver');
      expect(result.body).toBe('Progress: 45/90 days (50%)');
    });
  });

  describe('Template Customization and Personalization', () => {
    it('should allow user-specific template customization', () => {
      const userId = 'user-123';
      const templateId = 'like_post';
      const customizations = {
        title: { en: '🎉 {{username}} loved your {{contentType}}!' },
        sound: 'custom_chime',
        priority: 'high'
      };

      templateService.setUserCustomization(userId, templateId, customizations);

      const customized = templateService.getCustomizedTemplate(userId, templateId);
      expect(customized.title.en).toBe('🎉 {{username}} loved your {{contentType}}!');
      expect(customized.sound).toBe('custom_chime');
      expect(customized.priority).toBe('high');
    });

    it('should merge user customizations with base template', () => {
      // Register base template
      templateService.registerTemplate({
        id: 'base_template',
        type: 'test',
        title: { en: 'Base Title' },
        body: { en: 'Base Body' },
        sound: 'default',
        priority: 'normal'
      });

      const userId = 'user-123';
      const customizations = {
        title: { en: 'Custom Title' },
        // sound and priority should remain from base
      };

      templateService.setUserCustomization(userId, 'base_template', customizations);

      const result = templateService.getCustomizedTemplate(userId, 'base_template');
      
      expect(result.title.en).toBe('Custom Title');
      expect(result.body.en).toBe('Base Body'); // Unchanged from base
      expect(result.sound).toBe('default'); // Unchanged from base
      expect(result.priority).toBe('normal'); // Unchanged from base
    });

    it('should handle personalization based on user profile', () => {
      const userProfile = {
        id: 'user-123',
        firstName: 'Alex',
        preferences: {
          sobrietyStartDate: '2023-06-01',
          recoveryType: 'alcohol',
          milestonePreference: 'days'
        },
        achievements: ['30_days', '60_days', '90_days']
      };

      templateService.registerTemplate({
        id: 'personalized_milestone',
        type: 'milestone',
        title: {
          en: 'Hey {{firstName}}! {{days}} days strong! 💪'
        },
        body: {
          en: 'Amazing progress on your {{recoveryType}} recovery journey!'
        }
      });

      const variables = {
        firstName: userProfile.firstName,
        days: 100,
        recoveryType: userProfile.preferences.recoveryType
      };

      const result = templateService.renderPersonalizedTemplate(
        'personalized_milestone',
        variables,
        userProfile,
        'en'
      );

      expect(result.title).toBe('Hey Alex! 100 days strong! 💪');
      expect(result.body).toBe('Amazing progress on your alcohol recovery journey!');
    });

    it('should support conditional template content based on user data', () => {
      const userProfile = {
        id: 'user-123',
        achievements: ['30_days', '60_days'],
        streakCount: 75
      };

      templateService.registerTemplate({
        id: 'conditional_template',
        type: 'milestone',
        title: {
          en: '{{#hasLongStreak}}Incredible! {{days}} days!{{/hasLongStreak}}{{#hasShortStreak}}{{days}} days and counting!{{/hasShortStreak}}'
        },
        body: {
          en: '{{#isVeteran}}You\'re a recovery veteran!{{/isVeteran}}{{#isNewcomer}}Keep up the great work!{{/isNewcomer}}'
        }
      });

      const variables = {
        days: 75,
        hasLongStreak: userProfile.streakCount > 60,
        hasShortStreak: userProfile.streakCount <= 60,
        isVeteran: userProfile.achievements.length > 2,
        isNewcomer: userProfile.achievements.length <= 2
      };

      const result = templateService.renderConditionalTemplate(
        'conditional_template',
        variables,
        'en'
      );

      expect(result.title).toBe('Incredible! 75 days!'); // Long streak
      expect(result.body).toBe('Keep up the great work!'); // Newcomer (2 achievements)
    });
  });

  describe('Template Validation and Error Handling', () => {
    it('should validate template structure', () => {
      const validTemplate = {
        id: 'valid_template',
        type: 'like',
        title: { en: 'Valid title' },
        body: { en: 'Valid body' }
      };

      const result = templateService.validateTemplate(validTemplate);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid template structure', () => {
      const invalidTemplate = {
        // Missing id
        type: 'like',
        title: { en: 'Title' },
        // Missing body
      };

      const result = templateService.validateTemplate(invalidTemplate);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template ID is required');
      expect(result.errors).toContain('Template body is required');
    });

    it('should validate template variables', () => {
      const template = {
        id: 'variable_test',
        type: 'test',
        title: { en: '{{username}} did {{action}}' },
        body: { en: 'Details: {{details}}' }
      };

      const requiredVariables = templateService.extractRequiredVariables(template);
      expect(requiredVariables).toEqual(['username', 'action', 'details']);
    });

    it('should validate language support', () => {
      const template = {
        id: 'lang_test',
        type: 'test',
        title: { en: 'English', es: 'Español' },
        body: { en: 'English body' } // Missing Spanish body
      };

      const result = templateService.validateLanguageSupport(template);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing Spanish translation for body');
    });

    it('should handle template rendering errors gracefully', () => {
      // Register template with invalid structure
      const template = {
        id: 'broken_template',
        type: 'test',
        title: null, // Invalid
        body: { en: 'Body' }
      };

      templateService.registerTemplate(template);

      const result = templateService.renderTemplate('broken_template', {}, 'en');
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Failed to render template', expect.any(Object));
    });
  });

  describe('Template Caching and Performance', () => {
    it('should cache rendered templates for performance', () => {
      templateService.registerTemplate({
        id: 'cached_template',
        type: 'test',
        title: { en: 'Hello {{name}}' },
        body: { en: 'Welcome {{name}}!' }
      });

      const variables = { name: 'John' };
      const cacheKey = 'cached_template_en_' + JSON.stringify(variables);

      // First render
      const result1 = templateService.renderTemplate('cached_template', variables, 'en');
      expect(result1.title).toBe('Hello John');

      // Second render should use cache
      const result2 = templateService.renderTemplate('cached_template', variables, 'en');
      expect(result2).toEqual(result1);
      
      // Verify cache was used
      expect(templateService.getCacheStats().hits).toBeGreaterThan(0);
    });

    it('should invalidate cache when templates are updated', () => {
      const templateId = 'updateable_template';
      
      // Register initial template
      templateService.registerTemplate({
        id: templateId,
        type: 'test',
        title: { en: 'Original {{name}}' },
        body: { en: 'Original body' }
      });

      // Render and cache
      const result1 = templateService.renderTemplate(templateId, { name: 'John' }, 'en');
      expect(result1.title).toBe('Original John');

      // Update template
      templateService.updateTemplate(templateId, {
        title: { en: 'Updated {{name}}' }
      });

      // Should get updated version
      const result2 = templateService.renderTemplate(templateId, { name: 'John' }, 'en');
      expect(result2.title).toBe('Updated John');
    });

    it('should provide cache statistics', () => {
      const stats = templateService.getCacheStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should clear cache when requested', () => {
      templateService.registerTemplate({
        id: 'clear_test',
        type: 'test',
        title: { en: 'Test' },
        body: { en: 'Test body' }
      });

      // Create cache entry
      templateService.renderTemplate('clear_test', {}, 'en');
      expect(templateService.getCacheStats().size).toBeGreaterThan(0);

      // Clear cache
      templateService.clearCache();
      expect(templateService.getCacheStats().size).toBe(0);
    });
  });

  describe('Default Templates', () => {
    it('should load default recovery-focused notification templates', () => {
      templateService.loadDefaultTemplates();

      const defaultTemplates = [
        'like_notification',
        'comment_notification',
        'follow_notification',
        'milestone_reminder',
        'daily_checkin',
        'group_meeting_reminder',
        'achievement_unlocked',
        'support_message',
        'emergency_contact',
        'relapse_prevention_tip'
      ];

      defaultTemplates.forEach(templateId => {
        const template = templateService.getTemplate(templateId);
        expect(template).toBeDefined();
        expect(template.id).toBe(templateId);
      });
    });

    it('should include recovery-specific templates with appropriate content', () => {
      templateService.loadDefaultTemplates();

      const milestoneTemplate = templateService.getTemplate('milestone_reminder');
      expect(milestoneTemplate.title.en).toContain('days sober');
      expect(milestoneTemplate.type).toBe('milestone');

      const supportTemplate = templateService.getTemplate('support_message');
      expect(supportTemplate.title.en).toContain('support');
      expect(supportTemplate.priority).toBe('high'); // Support messages should be high priority
    });
  });
});