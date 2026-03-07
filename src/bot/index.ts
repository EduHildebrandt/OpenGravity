import { Bot, Context } from 'grammy';
import { config } from '../config.js';
import { runAgentLoop } from '../agent/loop.js';
import { clearMessages } from '../db/index.js';

let bot: Bot;

/**
 * Initializes and configures the Telegram bot
 */
export function initBot() {
  bot = new Bot(config.TELEGRAM_BOT_TOKEN as string);

  // --- Security Middleware: Only allowed users can interact ---
  bot.use(async (ctx: Context, next) => {
    const userId = ctx.from?.id.toString();
    
    if (!userId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
      console.warn(`[Security] Unauthorized access attempt from User ID: ${userId}. Message: ${ctx.message?.text}`);
      return; // Silently ignore unauthorized users
    }

    await next();
  });

  // --- Command: /start ---
  bot.command('start', async (ctx) => {
    const userId = ctx.from!.id.toString();
    await clearMessages(userId); // Reset conversation for the user
    await ctx.reply('¡Hola! Soy OpenGravity, tu agente de IA personal. ¿En qué te puedo ayudar hoy?');
  });

  // --- Command: /clear (reset memory) ---
  bot.command('clear', async (ctx) => {
    const userId = ctx.from!.id.toString();
    await clearMessages(userId);
    await ctx.reply('Memoria borrada. Empecemos de nuevo.');
  });

  // --- Main Message Handler ---
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userMessage = ctx.message.text;

    // Show typing status indicator
    await ctx.replyWithChatAction('typing');

    try {
      const response = await runAgentLoop(userId, userMessage);
      
      // Attempt to format generic markdown to Telegram's HTML if possible, 
      // or just reply directly. For simplicity we will reply directly using standard text.
      await ctx.reply(response, { parse_mode: 'Markdown' });

    } catch (error: any) {
      console.error('[Bot] Message Error:', error);
      await ctx.reply('Lo siento, ocurrió un error procesando tu mensaje.');
    }
  });

  // Error handling global hook
  bot.catch((err) => {
    console.error(`[Bot Error Global]:`, err);
  });
}

/**
 * Starts the bot using long polling
 */
export async function startBot() {
  console.log('Starting Telegram bot...');
  await bot.start();
}