import { Bot, Context } from 'grammy';
import { config } from '../config.js';
import { runAgentLoop } from '../agent/loop.js';
import { clearMessages } from '../db/index.js';
import { groq } from '../llm/generate.js';
import fetch from 'node-fetch';
import fs from 'fs';
import os from 'os';
import path from 'path';

let bot: Bot;

/**
 * Initializes and configures the Telegram bot
 */
export function getBot(): Bot {
  if (bot) return bot;

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
  bot.on(['message:text', 'message:voice'], async (ctx) => {
    const userId = ctx.from.id.toString();
    let userMessage = '';

    // Show typing status indicator
    await ctx.replyWithChatAction('typing');

    try {
      if (ctx.message.voice) {
        // Obtenemos información del archivo de voz de Telegram
        const fileId = ctx.message.voice.file_id;
        const file = await ctx.api.getFile(fileId);
        
        if (!file.file_path) {
          throw new Error('No se pudo obtener la ruta del archivo de voz.');
        }

        // URL para descargar el archivo (formato .oga por defecto en Telegram)
        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        
        await ctx.reply("He recibido tu nota de voz, procesando audio...");
        
        // 1. Descargamos el archivo temporalmente
        const res = await fetch(fileUrl);
        const tempFilePath = path.join(os.tmpdir(), `voice_${fileId}.ogg`);
        const fileStream = fs.createWriteStream(tempFilePath);
        
        await new Promise((resolve, reject) => {
          if (!res.body) {
             return reject(new Error("Response body is null"));
          }
          res.body.pipe(fileStream);
          res.body.on("error", reject);
          fileStream.on("finish", resolve);
        });

        // 2. Enviamos el archivo a Groq (Whisper)
        try {
          const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "distil-whisper-large-v3-en", // Nota: Whisper funciona para múltiples idiomas, aunque el modelo diga -en suele entender o se usa whisper-large-v3 si da error
          });

          userMessage = transcription.text;
          console.log(`[Voice] Transcribed Text: ${userMessage}`);
          
          if (!userMessage.trim()) {
            throw new Error("Transated text is empty");
          }
        } catch (error) {
           console.warn("Retrying with large-v3 for multilang");
           const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-large-v3", 
          });
          userMessage = transcription.text;
        }

        // 3. Limpieza: Borrado del archivo temporal
        if (fs.existsSync(tempFilePath)) {
           fs.unlinkSync(tempFilePath);
        }

      } else if (ctx.message.text) {
        userMessage = ctx.message.text;
      }

      if (!userMessage) return;

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

  return bot;
}