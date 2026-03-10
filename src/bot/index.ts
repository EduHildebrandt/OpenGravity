/**
 * @file src/bot/index.ts
 * @description Telegram bot setup and message handling for OpenGravity.
 *
 * Message flow:
 *   Voice message → Groq Whisper (STT) → Agent Loop → Murf.ai (TTS) → Voice reply
 *   Text message  →                       Agent Loop →                  Text reply
 *
 * Commands:
 *   /start  — Greet the user and reset conversation history.
 *   /clear  — Reset conversation history without a greeting.
 */

import { Bot, Context, InputFile } from 'grammy';
import { config } from '../config.js';
import { runAgentLoop } from '../agent/loop.js';
import { clearMessages } from '../db/index.js';
import { groq } from '../llm/generate.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

let bot: Bot;

// ---------------------------------------------------------------------------
// Bot factory
// ---------------------------------------------------------------------------

/**
 * Returns the singleton Bot instance, creating it on first call.
 * This pattern avoids re-initialising middleware on every Firebase cold start.
 */
export function getBot(): Bot {
  if (bot) return bot;

  bot = new Bot(config.TELEGRAM_BOT_TOKEN as string);

  // ── Security middleware ───────────────────────────────────────────────────
  // Silently drop messages from users not in the allowlist.
  bot.use(async (ctx: Context, next) => {
    const userId = ctx.from?.id.toString();
    if (!userId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
      console.warn(`[Security] Blocked unauthorized user: ${userId}`);
      return;
    }
    await next();
  });

  // ── /start command ────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    const userId = ctx.from!.id.toString();
    await clearMessages(userId);
    await ctx.reply('¡Hola! Soy OpenGravity, tu agente de IA personal. ¿En qué te puedo ayudar hoy?');
  });

  // ── /clear command ────────────────────────────────────────────────────────
  bot.command('clear', async (ctx) => {
    const userId = ctx.from!.id.toString();
    await clearMessages(userId);
    await ctx.reply('Memoria borrada. Empecemos de nuevo.');
  });

  // ── Main message handler ──────────────────────────────────────────────────
  bot.on(['message:text', 'message:voice'], async (ctx) => {
    const userId = ctx.from.id.toString();
    let userMessage = '';
    let isVoiceMessage = false;

    await ctx.replyWithChatAction('typing');

    try {
      // ── Voice message: transcribe with Groq Whisper ─────────────────────
      if (ctx.message.voice) {
        isVoiceMessage = true;

        // 1. Obtain the file download URL from Telegram
        const fileId = ctx.message.voice.file_id;
        const file = await ctx.api.getFile(fileId);
        if (!file.file_path) throw new Error('Could not obtain voice file path from Telegram.');

        const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        await ctx.reply('He recibido tu nota de voz, procesando audio…');

        // 2. Download the OGG file and write it to a temp path
        const tempFilePath = path.join(os.tmpdir(), `voice_${fileId}.ogg`);
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Failed to download voice file: ${res.status}`);

        // Native fetch returns a Web ReadableStream, so we use arrayBuffer() directly
        const voiceBuffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(tempFilePath, voiceBuffer);

        // 3. Transcribe with Whisper (try fast model first, fall back to multilingual)
        try {
          const tx = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'distil-whisper-large-v3-en',
          });
          userMessage = `[Nota de voz]: ${tx.text.trim()}`;
        } catch {
          console.warn('[Bot] Falling back to whisper-large-v3 for multilingual transcription');
          const tx = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'whisper-large-v3',
          });
          userMessage = `[Nota de voz]: ${tx.text.trim()}`;
        }

        // 4. Clean up temp file
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        console.log(`[Bot] Transcription: ${userMessage}`);

      // ── Text message ──────────────────────────────────────────────────────
      } else if (ctx.message.text) {
        userMessage = ctx.message.text;
      }

      if (!userMessage) return;

      // ── Run agent loop ─────────────────────────────────────────────────────
      const response = await runAgentLoop(userId, userMessage);

      // ── Reply: voice → Murf TTS, text → Markdown ──────────────────────────
      if (isVoiceMessage && config.MURF_API_KEY) {
        await ctx.replyWithChatAction('record_voice');
        try {
          // 1. Generate audio via Murf.ai
          const murfRes = await fetch('https://api.murf.ai/v1/speech/generate', {
            method: 'POST',
            headers: {
              'api-key': config.MURF_API_KEY,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              voiceId: config.MURF_VOICE_ID,
              style: 'Conversational',
              text: response,
              rate: 0,
              pitch: 0,
              sampleRate: 48000,
              format: 'MP3',
              channelType: 'STEREO',
            }),
          });

          if (!murfRes.ok) {
            const err = await murfRes.text();
            throw new Error(`Murf TTS error: ${murfRes.status} ${murfRes.statusText} — ${err}`);
          }

          const { audioFile } = await murfRes.json() as { audioFile: string };

          // 2. Download the generated audio and send it as a voice note
          const audioRes = await fetch(audioFile);
          if (!audioRes.ok) throw new Error(`Failed to download Murf audio: ${audioRes.status}`);

          const buffer = Buffer.from(await audioRes.arrayBuffer());
          await ctx.replyWithVoice(new InputFile(buffer, 'response.mp3'));

        } catch (ttsError) {
          // Graceful fallback: send the text response if TTS fails
          console.error('[Bot] TTS error, falling back to text:', ttsError);
          await ctx.reply(response, { parse_mode: 'Markdown' });
        }

      } else {
        // Plain text response (or TTS not configured)
        await ctx.reply(response, { parse_mode: 'Markdown' });
      }

    } catch (error: any) {
      console.error('[Bot] Unhandled message error:', error);
      await ctx.reply('Lo siento, ocurrió un error al procesar tu mensaje. Intentá de nuevo.');
    }
  });

  // ── Global error handler ──────────────────────────────────────────────────
  bot.catch((err) => console.error('[Bot] Global error:', err));

  return bot;
}