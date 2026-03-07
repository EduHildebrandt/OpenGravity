import './fetch-polyfill.js';
import { validateConfig } from './config.js';
import { initDb } from './db/index.js';
import { initBot, startBot } from './bot/index.js';

async function bootstrap() {
  try {
    console.log('Iniciando OpenGravity...');
    
    // 1. Validate environment configuration
    validateConfig();

    // 2. Initialize Database connection
    initDb();

    // 3. Initialize & Start Telegram Bot
    initBot();
    await startBot();

    console.log('OpenGravity está en línea y esperando mensajes.');
  } catch (error) {
    console.error('Error crítico al iniciar OpenGravity:', error);
    process.exit(1);
  }
}

// Global process error handlers
process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the application
bootstrap();