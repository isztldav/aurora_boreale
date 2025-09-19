/**
 * Centralized application configuration
 * This file contains all app-wide constants and configuration values
 */

export const APP_CONFIG = {
  // Application branding
  name: 'AuroraBoreale',
  shortName: 'Aurora',
  description: 'Advanced Machine Learning Training Platform for Reproducible AI Experiments',

  // Version information
  version: '2.0.0',

  // Navigation labels
  navigation: {
    dashboard: 'Projects',
    agents: 'Agents',
    tags: 'Tags',
    settings: 'Settings',
  },

  // Metadata for SEO and browser
  metadata: {
    title: 'AuroraBoreale - ML Training Platform',
    description: 'Advanced Machine Learning Training Platform for Reproducible AI Experiments',
    keywords: ['machine learning', 'training', 'ai', 'deep learning', 'reproducible'],
  },

  // Company/Organization info
  organization: {
    name: 'AuroraBoreale',
    url: 'https://auroraboreale.ai',
  },
} as const

// Export individual values for convenience
export const { name: APP_NAME, shortName: APP_SHORT_NAME, description: APP_DESCRIPTION } = APP_CONFIG
export const { navigation: NAV_LABELS } = APP_CONFIG
export const { metadata: APP_METADATA } = APP_CONFIG