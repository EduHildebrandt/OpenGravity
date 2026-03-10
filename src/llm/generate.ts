/**
 * @file src/llm/generate.ts
 * @description Unified LLM adapter for OpenGravity.
 *
 * Supports three providers selectable via the ACTIVE_LLM env var:
 *   - 'groq'       → Groq Cloud (llama-3.3-70b-versatile) — default
 *   - 'openrouter' → OpenRouter (configurable model)
 *   - 'gemini'     → Google Gemini 2.5 Flash
 *
 * All providers return the same `UnifiedMessage` shape so the agent loop
 * doesn't need to know which LLM is active.
 */

import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import type { MessageRow } from '../db/index.js';
import { tools } from '../agent/tools.js';
import type { AgentTool } from '../agent/tools.js';

// ---------------------------------------------------------------------------
// Client instances (created once at module load)
// ---------------------------------------------------------------------------

export const groq = new Groq({ apiKey: config.GROQ_API_KEY });

export const openrouter = new Groq({
  apiKey: config.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

export const gemini = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY || '' });

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

/**
 * Core instructions injected at the top of every LLM conversation.
 * Keep this concise — it is sent with every request.
 */
const SYSTEM_PROMPT = `Eres OpenGravity, un agente de IA avanzado con CAPACIDAD VOCAL TOTAL.
Tu objetivo es asistir al usuario. Piensa de forma clara y directa.
IMPORTANTE - INTERFAZ DE VOZ: El sistema está integrado con un motor de TTS (Text-to-Speech). Cuando el usuario te envía un audio, TU RESPUESTA DE TEXTO SERÁ CONVERTIDA EN VOZ AUTOMÁTICAMENTE.
- TIENES VOZ: Nunca digas que no puedes hablar o enviar audios. ¡SÍ PUEDES! Tu texto se locuta.
- REDACCIÓN: Escribe de forma natural para ser escuchado. Evita listas largas de Markdown o caracteres especiales que suenen mal al leerse.
- Si el usuario te pide un audio, hazlo con entusiasmo.
Comunícate siempre en español de forma concisa e informativa.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalised response returned by all LLM providers. */
export interface UnifiedMessage {
  /** The text content of the assistant's reply (null when only tool calls are present). */
  content: string | null;
  /** Tool calls requested by the LLM (null if the response is a final answer). */
  tool_calls: { id: string; name: string; args: any }[] | null;
}

// ---------------------------------------------------------------------------
// Message formatters
// ---------------------------------------------------------------------------

/**
 * Convert Firestore `MessageRow[]` to the OpenAI/Groq message format,
 * prepending the system prompt.
 */
function formatForGroq(
  dbMessages: MessageRow[]
): Groq.Chat.Completions.ChatCompletionMessageParam[] {
  const formatted: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const row of dbMessages) {
    if (row.role === 'user' || row.role === 'system') {
      formatted.push({ role: row.role as any, content: row.content || '' });
    } else if (row.role === 'assistant') {
      const msg: any = { role: 'assistant', content: row.content };
      if (row.tool_calls) {
        const parsedTcs = JSON.parse(row.tool_calls);
        msg.tool_calls = parsedTcs.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args },
        }));
      }
      formatted.push(msg);
    } else if (row.role === 'tool') {
      formatted.push({
        role: 'tool',
        content: row.content || '',
        tool_call_id: row.tool_call_id || '',
      });
    }
  }

  return formatted;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Call the configured LLM and return a normalised `UnifiedMessage`.
 *
 * @param userId       Telegram user ID (for logging / future per-user config).
 * @param history      Full conversation history from Firestore.
 * @param activeTools  Tool registry to expose to the LLM.
 */
export async function generateCompletion(
  userId: string,
  history: MessageRow[],
  activeTools: Record<string, AgentTool>
): Promise<UnifiedMessage> {
  const llm = config.ACTIVE_LLM;

  // ── Groq / OpenRouter ───────────────────────────────────────────────────────
  if (llm === 'groq' || llm === 'openrouter') {
    const client = llm === 'openrouter' ? openrouter : groq;
    const model =
      llm === 'openrouter' ? config.OPENROUTER_MODEL : 'llama-3.3-70b-versatile';

    const formattedTools: Groq.Chat.Completions.ChatCompletionTool[] =
      Object.values(activeTools).map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

    const completion = await client.chat.completions.create({
      model,
      messages: formatForGroq(history),
      tools: formattedTools.length > 0 ? formattedTools : undefined,
      tool_choice: formattedTools.length > 0 ? 'auto' : undefined,
    } as any); // 'as any' needed due to overly strict exactOptionalPropertyTypes in Groq's TS types

    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error('No message returned from LLM');

    return {
      content: msg.content,
      tool_calls: msg.tool_calls
        ? msg.tool_calls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: tc.function.arguments,
          }))
        : null,
    };
  }

  // ── Google Gemini ───────────────────────────────────────────────────────────
  if (llm === 'gemini') {
    const contents: any[] = [];

    for (const row of history) {
      if (row.role === 'user' || row.role === 'system') {
        contents.push({ role: 'user', parts: [{ text: row.content || '' }] });
      } else if (row.role === 'assistant') {
        const parts: any[] = [];
        if (row.content) parts.push({ text: row.content });
        if (row.tool_calls) {
          const tcs = JSON.parse(row.tool_calls);
          for (const tc of tcs) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : tc.args,
              },
            });
          }
        }
        contents.push({ role: 'model', parts });
      } else if (row.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: row.name, response: { result: row.content } } }],
        });
      }
    }

    const geminiTools = [
      {
        functionDeclarations: Object.values(activeTools).map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: { systemInstruction: SYSTEM_PROMPT, tools: geminiTools },
    });

    const calls = response.functionCalls;
    const tool_calls =
      calls && calls.length > 0
        ? calls.map((c, i) => ({
            id: `call_${i}`,
            name: c.name || 'unknown_tool',
            args: JSON.stringify(c.args), // serialised here; deserialised in the loop
          }))
        : null;

    return { content: response.text || '', tool_calls };
  }

  throw new Error(`Unsupported LLM provider: "${llm}". Check ACTIVE_LLM in your .env file.`);
}