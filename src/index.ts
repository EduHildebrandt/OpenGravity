import './fetch-polyfill.js';
import { validateConfig } from './config.js';
import { initDb } from './db/index.js';
import { getBot } from './bot/index.js';
import { onRequest } from 'firebase-functions/v2/https';
import { webhookCallback } from 'grammy';

// 1. Initial Validation
try {
  validateConfig();
  initDb();
} catch (error) {
  console.error('Error crítico al iniciar OpenGravity:', error);
}

// 2. Export the Webhook endpoint for Firebase Functions
const bot = getBot();

export const telegramWebhook = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300, // Important: LLMs often take longer than default 60s
  },
  webhookCallback(bot, 'https')
);