import dotenv from 'dotenv';

// Load environment variables from .env file (local dev).
// In Firebase, these are injected via firebase.json > functions > env.
dotenv.config();

// ---------------------------------------------------------------------------
// Central configuration object — all env vars live here and nowhere else.
// ---------------------------------------------------------------------------
export const config = {
  // --- Telegram ---
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  /** Comma-separated list of Telegram User IDs allowed to use the bot */
  TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS
    ? process.env.TELEGRAM_ALLOWED_USER_IDS.split(',').map((id) => id.trim())
    : [],

  // --- LLM ---
  /** Which LLM provider to use: 'groq' | 'gemini' | 'openrouter' */
  ACTIVE_LLM: process.env.ACTIVE_LLM || 'groq',
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  /** Model slug to use when ACTIVE_LLM = 'openrouter', e.g. 'openrouter/free' */
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'openrouter/free',

  // --- Text-to-Speech (Murf.ai) ---
  MURF_API_KEY: process.env.MURF_API_KEY,
  /**
   * Voice ID for Murf TTS responses.
   * Spanish options: es-MX-alejandro, es-MX-carlos, es-MX-valeria,
   *                  es-ES-enrique, es-ES-javier, es-ES-carla, es-ES-carmen
   */
  MURF_VOICE_ID: process.env.MURF_VOICE_ID || 'es-MX-alejandro',
};

// ---------------------------------------------------------------------------
// Startup validation — throws early if required vars are missing.
// ---------------------------------------------------------------------------
export function validateConfig() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required in .env file.');
  }
  if (config.TELEGRAM_ALLOWED_USER_IDS.length === 0) {
    throw new Error('TELEGRAM_ALLOWED_USER_IDS is required in .env file for security.');
  }
  if (config.ACTIVE_LLM === 'groq' && !config.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required when ACTIVE_LLM=groq.');
  }
  if (config.ACTIVE_LLM === 'gemini' && !config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required when ACTIVE_LLM=gemini.');
  }
  if (config.ACTIVE_LLM === 'openrouter' && !config.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required when ACTIVE_LLM=openrouter.');
  }
}