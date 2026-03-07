import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
dotenv.config();

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS
    ? process.env.TELEGRAM_ALLOWED_USER_IDS.split(',').map((id) => id.trim())
    : [],
  ACTIVE_LLM: process.env.ACTIVE_LLM || 'groq',
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'openrouter/free',
};

export function validateConfig() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required in .env file.');
  }

  if (config.TELEGRAM_ALLOWED_USER_IDS.length === 0) {
    throw new Error('TELEGRAM_ALLOWED_USER_IDS is required in .env file for security.');
  }

  if (config.ACTIVE_LLM === 'groq' && !config.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required in .env file when ACTIVE_LLM is groq.');
  }

  if (config.ACTIVE_LLM === 'gemini' && !config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required in .env file when ACTIVE_LLM is gemini.');
  }
}