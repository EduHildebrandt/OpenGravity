/**
 * @file src/index.ts
 * @description Entry point for the OpenGravity Firebase Cloud Function.
 *
 * This file is responsible for:
 *   1. Validating that all required environment variables are present.
 *   2. Initialising the Firestore database connection.
 *   3. Initialising the Telegram bot with all its handlers.
 *   4. Exporting the `telegramWebhook` HTTP endpoint that Telegram calls
 *      every time a user sends a message.
 */

import './fetch-polyfill.js'; // Must be first: patches Node.js fetch to use IPv4
import { validateConfig } from './config.js';
import { initDb } from './db/index.js';
import { getBot } from './bot/index.js';
import { onRequest } from 'firebase-functions/v2/https';
import { webhookCallback } from 'grammy';

// ---------------------------------------------------------------------------
// Startup: validate config and initialise services
// Runs once when the Firebase Function container cold-starts.
// ---------------------------------------------------------------------------
try {
  validateConfig(); // Throws early if any required env var is missing
  initDb();         // Connects to Firestore (no-ops if already connected)
} catch (error) {
  console.error('[Startup] Critical error during initialisation:', error);
  // We don't rethrow here so that Firebase will still start the function
  // and return a useful error log rather than a silent crash.
}

// ---------------------------------------------------------------------------
// Bot initialisation
// Registers all command and message handlers (runs once per container).
// ---------------------------------------------------------------------------
const bot = getBot();

// ---------------------------------------------------------------------------
// Firebase Cloud Function export
// Telegram sends a POST request to this URL for every user interaction.
// ---------------------------------------------------------------------------
export const telegramWebhook = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300, // LLM calls can take a while — well above the 60s default
    invoker: 'public',   // Telegram must be able to call this without authentication
  },
  webhookCallback(bot, 'express') // 'express' adapter: Firebase already parses req.body
);