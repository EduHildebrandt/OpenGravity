import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import type { MessageRow } from '../db/index.js';
import { tools } from '../agent/tools.js';
import type { AgentTool } from '../agent/tools.js';

export const groq = new Groq({ apiKey: config.GROQ_API_KEY });
export const openrouter = new Groq({ 
  apiKey: config.OPENROUTER_API_KEY, 
  baseURL: 'https://openrouter.ai/api/v1' 
});
export const gemini = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY || '' });

const SYSTEM_PROMPT = `Eres OpenGravity, un agente de IA personal creado desde cero que funciona localmente y usa Telegram como única interfaz.
Tu objetivo principal es asistir al usuario que te ha creado. Piensa de forma clara, directa y segura.
El usuario puede enviarte tanto mensajes de texto como notas de voz (verás estas últimas precedidas por '[Nota de voz]:'). Si te envían una nota de voz, asume que la has escuchado y trata el contenido transcribido con total naturalidad.
No debes ejecutar comandos ni acciones inseguras o usar herramientas no verificadas.
Comunícate siempre en español, a menos que el usuario indique lo contrario.
Haz respuestas concisas pero informativas.`;

export interface UnifiedMessage {
  content: string | null;
  tool_calls: { id: string; name: string; args: any }[] | null;
}

/**
 * Transforms DB messages to Groq/OpenAI compatible array
 */
function formatForGroq(dbMessages: MessageRow[]): Groq.Chat.Completions.ChatCompletionMessageParam[] {
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
          function: { name: tc.name, arguments: tc.args }
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

/**
 * Main completion function handling all LLMs
 */
export async function generateCompletion(userId: string, history: MessageRow[], activeTools: Record<string, AgentTool>): Promise<UnifiedMessage> {
  const llm = config.ACTIVE_LLM;

  if (llm === 'groq' || llm === 'openrouter') {
    const client = llm === 'openrouter' ? openrouter : groq;
    const model = llm === 'openrouter' ? config.OPENROUTER_MODEL : 'llama-3.3-70b-versatile';
    
    const formattedTools: Groq.Chat.Completions.ChatCompletionTool[] = Object.values(activeTools).map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const apiMessages = formatForGroq(history);
    const completion = await client.chat.completions.create({
      model,
      messages: apiMessages,
      tools: formattedTools.length > 0 ? formattedTools : undefined,
      tool_choice: formattedTools.length > 0 ? 'auto' : undefined,
    } as any); // Using 'as any' to bypass overly strict exactOptionalPropertyTypes in Groq types with TS node16
    
    const msg = completion.choices[0]?.message;
    if (!msg) {
      throw new Error("No message returned from LLM");
    }
    return {
      content: msg.content,
      tool_calls: msg.tool_calls ? msg.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        args: tc.function.arguments
      })) : null
    };
  }

  if (llm === 'gemini') {
    // Gemini message formatting
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
            parts.push({ functionCall: { name: tc.name, args: typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : tc.args } });
          }
        }
        contents.push({ role: 'model', parts });
      } else if (row.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: row.name, response: { result: row.content } } }]
        });
      }
    }

    const geminiTools = [{
      functionDeclarations: Object.values(activeTools).map(t => ({
        name: t.name, description: t.description, parameters: t.parameters
      }))
    }];

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: geminiTools
      }
    });

    const calls = response.functionCalls;
    let tool_calls = null;
    
    if (calls && calls.length > 0) {
      tool_calls = calls.map((c, i) => ({
        id: `call_${i}`,
        name: c.name || 'unknown_tool',
        // Stringify here because we un-stringify it later in the loop to be compatible with groq parsing
        args: JSON.stringify(c.args) 
      }));
    }

    return {
      content: response.text || '',
      tool_calls
    };
  }

  throw new Error(`Unsupported LLM: ${llm}`);
}