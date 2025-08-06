/**
 * Notification Template Service
 * Manages notification templates, customization, localization, and personalization
 */

import { logger } from '../utils/logger';

export interface LocalizedContent {
  [language: string]: string;
}

export interface NotificationTemplate {
  id: string;
  type: string;
  title: LocalizedContent;
  body: LocalizedContent;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
  sound?: string;
  icon?: string;
  vibration?: number[];
  badge?: number;
  category?: string;
  threadId?: string;
}

export interface RenderedTemplate {
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: string;
  sound?: string;
  icon?: string;
  vibration?: number[];
  badge?: number;
  category?: string;
  threadId?: string;
}

export interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  preferences?: Record<string, any>;
  achievements?: string[];
  streakCount?: number;
  [key: string]: any;
}

export interface TemplateCustomization {
  title?: LocalizedContent;
  body?: LocalizedContent;
  sound?: string;
  priority?: 'low' | 'normal' | 'high';
  icon?: string;
  vibration?: number[];
  badge?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class NotificationTemplateService {
  private templates: Map<string, NotificationTemplate> = new Map();
  private userCustomizations: Map<string, Map<string, TemplateCustomization>> = new Map();
  private renderCache: Map<string, RenderedTemplate> = new Map();
  private cacheStats = {
    hits: 0,
    misses: 0,
  };

  private readonly SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt'];
  private readonly DEFAULT_LANGUAGE = 'en';
  private readonly CACHE_MAX_SIZE = 1000;

  /**
   * Template Registration and Management
   */

  public registerTemplate(template: NotificationTemplate): void {
    const validation = this.validateTemplate(template);
    if (!validation.isValid) {
      throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
    }

    if (this.templates.has(template.id)) {
      throw new Error(`Template with ID ${template.id} already exists`);
    }

    this.templates.set(template.id, { ...template });
    this.invalidateCache(template.id);

    logger.info('Template registered', {
      templateId: template.id,
      type: template.type,
      languages: Object.keys(template.title),
    });
  }

  public getTemplate(templateId: string): NotificationTemplate | undefined {
    return this.templates.get(templateId);
  }

  public getAllTemplates(): NotificationTemplate[] {
    return Array.from(this.templates.values());
  }

  public updateTemplate(templateId: string, updates: Partial<NotificationTemplate>): void {
    const existingTemplate = this.templates.get(templateId);
    if (!existingTemplate) {
      throw new Error(`Template ${templateId} not found`);
    }

    const updatedTemplate = { ...existingTemplate, ...updates };
    const validation = this.validateTemplate(updatedTemplate);
    if (!validation.isValid) {
      throw new Error(`Invalid template update: ${validation.errors.join(', ')}`);
    }

    this.templates.set(templateId, updatedTemplate);
    this.invalidateCache(templateId);

    logger.info('Template updated', {
      templateId,
      updatedFields: Object.keys(updates),
    });
  }

  public deleteTemplate(templateId: string): boolean {
    const deleted = this.templates.delete(templateId);
    if (deleted) {
      this.invalidateCache(templateId);
      logger.info('Template deleted', { templateId });
    }
    return deleted;
  }

  /**
   * Template Rendering and Personalization
   */

  public renderTemplate(
    templateId: string,
    variables: Record<string, any>,
    language: string = this.DEFAULT_LANGUAGE
  ): RenderedTemplate | null {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(templateId, variables, language);
      const cached = this.renderCache.get(cacheKey);
      if (cached) {
        this.cacheStats.hits++;
        return cached;
      }

      this.cacheStats.misses++;

      const template = this.templates.get(templateId);
      if (!template) {
        logger.warn('Template not found', { templateId });
        return null;
      }

      // Get localized content with fallback
      const localizedTitle = this.getLocalizedContent(template.title, language);
      const localizedBody = this.getLocalizedContent(template.body, language);

      // Render template with variables
      const renderedTitle = this.substituteVariables(localizedTitle, variables);
      const renderedBody = this.substituteVariables(localizedBody, variables);
      const renderedData = this.substituteVariablesInData(template.data || {}, variables);

      const result: RenderedTemplate = {
        title: renderedTitle,
        body: renderedBody,
        data: renderedData,
        priority: template.priority,
        sound: template.sound,
        icon: template.icon,
        vibration: template.vibration,
        badge: template.badge,
        category: template.category,
        threadId: template.threadId,
      };

      // Cache result
      this.cacheRenderedTemplate(cacheKey, result);

      return result;
    } catch (error) {
      logger.error('Failed to render template', {
        templateId,
        language,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  public renderPersonalizedTemplate(
    templateId: string,
    variables: Record<string, any>,
    userProfile: UserProfile,
    language: string = this.DEFAULT_LANGUAGE
  ): RenderedTemplate | null {
    // Enhance variables with user profile data
    const enhancedVariables = {
      ...variables,
      ...this.extractUserVariables(userProfile),
    };

    return this.renderTemplate(templateId, enhancedVariables, language);
  }

  public renderConditionalTemplate(
    templateId: string,
    variables: Record<string, any>,
    language: string = this.DEFAULT_LANGUAGE
  ): RenderedTemplate | null {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }

    // Process conditional content using Mustache-like syntax
    const localizedTitle = this.getLocalizedContent(template.title, language);
    const localizedBody = this.getLocalizedContent(template.body, language);

    const renderedTitle = this.processConditionalContent(localizedTitle, variables);
    const renderedBody = this.processConditionalContent(localizedBody, variables);

    return {
      title: renderedTitle,
      body: renderedBody,
      data: this.substituteVariablesInData(template.data || {}, variables),
      priority: template.priority,
      sound: template.sound,
      icon: template.icon,
    };
  }

  /**
   * Template Customization
   */

  public setUserCustomization(
    userId: string,
    templateId: string,
    customization: TemplateCustomization
  ): void {
    if (!this.userCustomizations.has(userId)) {
      this.userCustomizations.set(userId, new Map());
    }

    const userCustomizations = this.userCustomizations.get(userId)!;
    userCustomizations.set(templateId, customization);

    logger.info('User template customization set', {
      userId,
      templateId,
      customizedFields: Object.keys(customization),
    });
  }

  public getCustomizedTemplate(userId: string, templateId: string): NotificationTemplate | undefined {
    const baseTemplate = this.templates.get(templateId);
    if (!baseTemplate) {
      return undefined;
    }

    const userCustomizations = this.userCustomizations.get(userId);
    if (!userCustomizations) {
      return baseTemplate;
    }

    const customization = userCustomizations.get(templateId);
    if (!customization) {
      return baseTemplate;
    }

    // Merge base template with user customizations
    return this.mergeTemplateWithCustomization(baseTemplate, customization);
  }

  public clearUserCustomizations(userId: string): void {
    this.userCustomizations.delete(userId);
    logger.info('User customizations cleared', { userId });
  }

  /**
   * Template Validation
   */

  public validateTemplate(template: any): ValidationResult {
    const errors: string[] = [];

    if (!template.id) {
      errors.push('Template ID is required');
    }

    if (!template.type) {
      errors.push('Template type is required');
    }

    if (!template.title || typeof template.title !== 'object') {
      errors.push('Template title is required and must be an object with language keys');
    }

    if (!template.body || typeof template.body !== 'object') {
      errors.push('Template body is required and must be an object with language keys');
    }

    if (template.priority && !['low', 'normal', 'high'].includes(template.priority)) {
      errors.push('Template priority must be low, normal, or high');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public validateLanguageSupport(template: NotificationTemplate): ValidationResult {
    const errors: string[] = [];
    const titleLanguages = Object.keys(template.title);
    const bodyLanguages = Object.keys(template.body);

    // Check if all languages in title have corresponding body translations
    for (const lang of titleLanguages) {
      if (!bodyLanguages.includes(lang)) {
        const languageName = this.getLanguageName(lang);
        errors.push(`Missing ${languageName} translation for body`);
      }
    }

    // Check if all languages in body have corresponding title translations
    for (const lang of bodyLanguages) {
      if (!titleLanguages.includes(lang)) {
        const languageName = this.getLanguageName(lang);
        errors.push(`Missing ${languageName} translation for title`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public extractRequiredVariables(template: NotificationTemplate): string[] {
    const variables = new Set<string>();
    
    // Extract from title
    Object.values(template.title).forEach(content => {
      const matches = content.match(/\{\{(\w+(?:\.\w+)*)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const variable = match.replace(/\{\{|\}\}/g, '');
          variables.add(variable);
        });
      }
    });

    // Extract from body
    Object.values(template.body).forEach(content => {
      const matches = content.match(/\{\{(\w+(?:\.\w+)*)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const variable = match.replace(/\{\{|\}\}/g, '');
          variables.add(variable);
        });
      }
    });

    return Array.from(variables).sort();
  }

  /**
   * Default Templates
   */

  public loadDefaultTemplates(): void {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'like_notification',
        type: 'like',
        title: {
          en: '{{username}} liked your {{contentType}}',
          es: 'A {{username}} le gustó tu {{contentType}}',
          fr: '{{username}} a aimé votre {{contentType}}',
        },
        body: {
          en: 'Your {{contentType}} "{{contentTitle}}" received a like from {{username}}',
          es: 'Tu {{contentType}} "{{contentTitle}}" recibió un me gusta de {{username}}',
          fr: 'Votre {{contentType}} "{{contentTitle}}" a reçu un j\'aime de {{username}}',
        },
        data: {
          actionType: 'like',
          contentId: '{{contentId}}',
          userId: '{{userId}}',
        },
        priority: 'normal',
        sound: 'default',
        icon: 'like_icon',
      },
      {
        id: 'comment_notification',
        type: 'comment',
        title: {
          en: 'New comment on your {{contentType}}',
          es: 'Nuevo comentario en tu {{contentType}}',
          fr: 'Nouveau commentaire sur votre {{contentType}}',
        },
        body: {
          en: '{{username}} commented: {{commentPreview}}',
          es: '{{username}} comentó: {{commentPreview}}',
          fr: '{{username}} a commenté : {{commentPreview}}',
        },
        data: {
          actionType: 'comment',
          contentId: '{{contentId}}',
          commentId: '{{commentId}}',
          userId: '{{userId}}',
        },
        priority: 'normal',
        sound: 'default',
        icon: 'comment_icon',
      },
      {
        id: 'follow_notification',
        type: 'follow',
        title: {
          en: '{{username}} started following you',
          es: '{{username}} comenzó a seguirte',
          fr: '{{username}} a commencé à vous suivre',
        },
        body: {
          en: 'You have a new follower! Check out {{username}}\'s profile',
          es: '¡Tienes un nuevo seguidor! Echa un vistazo al perfil de {{username}}',
          fr: 'Vous avez un nouveau suiveur ! Découvrez le profil de {{username}}',
        },
        data: {
          actionType: 'follow',
          userId: '{{userId}}',
        },
        priority: 'normal',
        sound: 'default',
        icon: 'follow_icon',
      },
      {
        id: 'milestone_reminder',
        type: 'milestone',
        title: {
          en: 'Congratulations on {{days}} days sober!',
          es: '¡Felicidades por {{days}} días sobrio!',
          fr: 'Félicitations pour {{days}} jours de sobriété !',
        },
        body: {
          en: 'You\'ve reached {{days}} days of sobriety. Keep up the amazing work!',
          es: '¡Has alcanzado {{days}} días de sobriedad. ¡Sigue con el increíble trabajo!',
          fr: 'Vous avez atteint {{days}} jours de sobriété. Continuez ce travail formidable !',
        },
        data: {
          milestoneType: 'days',
          count: '{{days}}',
        },
        priority: 'high',
        sound: 'celebration',
        icon: 'milestone_icon',
      },
      {
        id: 'daily_checkin',
        type: 'reminder',
        title: {
          en: 'Time for your daily check-in',
          es: 'Hora de tu registro diario',
          fr: 'Il est temps de faire votre bilan quotidien',
        },
        body: {
          en: 'How are you feeling today? Take a moment to reflect on your recovery journey',
          es: '¿Cómo te sientes hoy? Tómate un momento para reflexionar sobre tu proceso de recuperación',
          fr: 'Comment vous sentez-vous aujourd\'hui ? Prenez un moment pour réfléchir à votre parcours de rétablissement',
        },
        priority: 'normal',
        sound: 'gentle',
        icon: 'checkin_icon',
      },
      {
        id: 'group_meeting_reminder',
        type: 'reminder',
        title: {
          en: 'Group meeting in {{minutes}} minutes',
          es: 'Reunión de grupo en {{minutes}} minutos',
          fr: 'Réunion de groupe dans {{minutes}} minutes',
        },
        body: {
          en: 'Don\'t forget about your {{meetingType}} meeting at {{time}}',
          es: 'No olvides tu reunión de {{meetingType}} a las {{time}}',
          fr: 'N\'oubliez pas votre réunion {{meetingType}} à {{time}}',
        },
        data: {
          meetingId: '{{meetingId}}',
          meetingType: '{{meetingType}}',
        },
        priority: 'high',
        sound: 'important',
        icon: 'meeting_icon',
      },
      {
        id: 'achievement_unlocked',
        type: 'achievement',
        title: {
          en: 'Achievement Unlocked: {{achievementName}}',
          es: 'Logro Desbloqueado: {{achievementName}}',
          fr: 'Succès Débloqué : {{achievementName}}',
        },
        body: {
          en: 'Congratulations! You\'ve earned the {{achievementName}} badge',
          es: '¡Felicidades! Has ganado la insignia {{achievementName}}',
          fr: 'Félicitations ! Vous avez gagné le badge {{achievementName}}',
        },
        data: {
          achievementId: '{{achievementId}}',
          achievementType: '{{achievementType}}',
        },
        priority: 'high',
        sound: 'achievement',
        icon: 'achievement_icon',
      },
      {
        id: 'support_message',
        type: 'support',
        title: {
          en: 'Someone sent you support',
          es: 'Alguien te envió apoyo',
          fr: 'Quelqu\'un vous a envoyé du soutien',
        },
        body: {
          en: '{{username}} sent you an encouraging message: "{{message}}"',
          es: '{{username}} te envió un mensaje de aliento: "{{message}}"',
          fr: '{{username}} vous a envoyé un message d\'encouragement : "{{message}}"',
        },
        data: {
          senderId: '{{senderId}}',
          messageId: '{{messageId}}',
        },
        priority: 'high',
        sound: 'support',
        icon: 'support_icon',
      },
      {
        id: 'emergency_contact',
        type: 'emergency',
        title: {
          en: 'Crisis Support Available',
          es: 'Apoyo de Crisis Disponible',
          fr: 'Soutien de Crise Disponible',
        },
        body: {
          en: 'If you\'re in crisis, help is available. Tap to access emergency resources',
          es: 'Si estás en crisis, hay ayuda disponible. Toca para acceder a recursos de emergencia',
          fr: 'Si vous êtes en crise, de l\'aide est disponible. Appuyez pour accéder aux ressources d\'urgence',
        },
        priority: 'high',
        sound: 'urgent',
        icon: 'emergency_icon',
      },
      {
        id: 'relapse_prevention_tip',
        type: 'tip',
        title: {
          en: 'Recovery Tip of the Day',
          es: 'Consejo de Recuperación del Día',
          fr: 'Conseil de Rétablissement du Jour',
        },
        body: {
          en: '{{tipContent}}',
          es: '{{tipContent}}',
          fr: '{{tipContent}}',
        },
        data: {
          tipId: '{{tipId}}',
          category: '{{category}}',
        },
        priority: 'low',
        sound: 'gentle',
        icon: 'tip_icon',
      },
    ];

    defaultTemplates.forEach(template => {
      if (!this.templates.has(template.id)) {
        this.templates.set(template.id, template);
      }
    });

    logger.info('Default templates loaded', {
      count: defaultTemplates.length,
      templateIds: defaultTemplates.map(t => t.id),
    });
  }

  /**
   * Cache Management
   */

  public getCacheStats(): CacheStats {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      size: this.renderCache.size,
      hitRate: total > 0 ? this.cacheStats.hits / total : 0,
    };
  }

  public clearCache(): void {
    this.renderCache.clear();
    this.cacheStats.hits = 0;
    this.cacheStats.misses = 0;
    logger.info('Template cache cleared');
  }

  /**
   * Private helper methods
   */

  private getLocalizedContent(content: LocalizedContent, language: string): string {
    if (content[language]) {
      return content[language];
    }

    // Fallback to English
    if (content[this.DEFAULT_LANGUAGE]) {
      logger.warn(`Language ${language} not available for template, falling back to English`);
      return content[this.DEFAULT_LANGUAGE];
    }

    // Fallback to first available language
    const firstLanguage = Object.keys(content)[0];
    if (firstLanguage) {
      logger.warn(`Neither ${language} nor English available, using ${firstLanguage}`);
      return content[firstLanguage];
    }

    return '';
  }

  private substituteVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }

  private substituteVariablesInData(
    data: Record<string, any>,
    variables: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        result[key] = this.substituteVariables(value, variables);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private processConditionalContent(template: string, variables: Record<string, any>): string {
    // Simple Mustache-like conditional processing
    return template.replace(
      /\{\{#(\w+)\}\}(.*?)\{\{\/\1\}\}/g,
      (match, condition, content) => {
        return variables[condition] ? content : '';
      }
    );
  }

  private extractUserVariables(userProfile: UserProfile): Record<string, any> {
    return {
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      fullName: [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' '),
      streakCount: userProfile.streakCount,
      achievementCount: userProfile.achievements?.length || 0,
      ...userProfile.preferences,
    };
  }

  private mergeTemplateWithCustomization(
    baseTemplate: NotificationTemplate,
    customization: TemplateCustomization
  ): NotificationTemplate {
    return {
      ...baseTemplate,
      title: customization.title ? { ...baseTemplate.title, ...customization.title } : baseTemplate.title,
      body: customization.body ? { ...baseTemplate.body, ...customization.body } : baseTemplate.body,
      sound: customization.sound || baseTemplate.sound,
      priority: customization.priority || baseTemplate.priority,
      icon: customization.icon || baseTemplate.icon,
      vibration: customization.vibration || baseTemplate.vibration,
      badge: customization.badge || baseTemplate.badge,
    };
  }

  private generateCacheKey(templateId: string, variables: Record<string, any>, language: string): string {
    const variableHash = JSON.stringify(variables);
    return `${templateId}_${language}_${variableHash}`;
  }

  private cacheRenderedTemplate(cacheKey: string, rendered: RenderedTemplate): void {
    // Implement LRU cache behavior
    if (this.renderCache.size >= this.CACHE_MAX_SIZE) {
      const firstKey = this.renderCache.keys().next().value;
      this.renderCache.delete(firstKey);
    }

    this.renderCache.set(cacheKey, rendered);
  }

  private invalidateCache(templateId: string): void {
    // Remove all cache entries for this template
    const keysToDelete = Array.from(this.renderCache.keys()).filter(key =>
      key.startsWith(templateId + '_')
    );

    keysToDelete.forEach(key => this.renderCache.delete(key));
  }

  private getLanguageName(languageCode: string): string {
    const languageNames: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
    };

    return languageNames[languageCode] || languageCode;
  }
}