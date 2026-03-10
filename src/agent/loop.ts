/**
 * @file src/agent/loop.ts
 * @description Core agent loop for OpenGravity.
 *
 * Flow per user message:
 *   1. Save the user message to Firestore.
 *   2. Fetch the conversation history.
 *   3. Call the LLM.
 *   4. If the LLM requests a tool → execute it, save the result, go to 2.
 *   5. If the LLM returns a final text answer → save it and return it.
 *
 * The loop is capped at MAX_ITERATIONS to prevent runaway tool chains.
 */

import { generateCompletion } from '../llm/generate.js';
import { getMessagesByUser, saveMessage } from '../db/index.js';
import { tools } from './tools.js';

/** Maximum number of LLM ↔ tool round-trips before giving up. */
const MAX_ITERATIONS = 5;

/**
 * Run the agent loop for a single user message.
 *
 * @param userId  Telegram user ID (used as the Firestore document key).
 * @param userMessage  Plain-text content of the user's message.
 * @returns  The final text response to send back to the user.
 */
export async function runAgentLoop(
  userId: string,
  userMessage: string
): Promise<string> {
  // Persist the incoming user message
  await saveMessage({
    user_id: userId,
    role: 'user',
    content: userMessage,
    name: null,
    tool_calls: null,
    tool_call_id: null,
  });

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`[Agent] Iteration ${iteration}/${MAX_ITERATIONS} for user ${userId}`);

    const history = await getMessagesByUser(userId);

    let content: string | null;
    let tool_calls: { id: string; name: string; args: any }[] | null;

    try {
      ({ content, tool_calls } = await generateCompletion(userId, history, tools));
    } catch (error: any) {
      console.error('[Agent] LLM error:', error);
      return 'Ocurrió un error al contactar al modelo de lenguaje. Revisá tus variables de entorno y API keys.';
    }

    // Persist the assistant turn (may be a tool-call turn with no text content)
    await saveMessage({
      user_id: userId,
      role: 'assistant',
      content: content ?? '',
      name: null,
      tool_calls: tool_calls ? JSON.stringify(tool_calls) : null,
      tool_call_id: null,
    });

    // ── Tool execution ────────────────────────────────────────────────────────
    if (tool_calls && tool_calls.length > 0) {
      for (const call of tool_calls) {
        console.log(`[Agent] Executing tool: ${call.name}`);

        const tool = tools[call.name];
        let toolResult: string;

        if (tool) {
          try {
            const args =
              typeof call.args === 'string'
                ? JSON.parse(call.args || '{}')
                : call.args ?? {};
            toolResult = await tool.execute(args);
          } catch (err: any) {
            toolResult = `Error executing tool "${call.name}": ${err.message}`;
            console.error('[Agent] Tool execution error:', err);
          }
        } else {
          toolResult = `Error: Tool "${call.name}" is not registered.`;
          console.warn(`[Agent] Unknown tool requested: ${call.name}`);
        }

        // Save the tool result so the LLM can read it in the next iteration
        await saveMessage({
          user_id: userId,
          role: 'tool',
          content: toolResult,
          name: call.name,
          tool_calls: null,
          tool_call_id: call.id,
        });
      }

      // Loop back so the LLM can process the tool results
      continue;
    }

    // ── Final answer ──────────────────────────────────────────────────────────
    return content || 'Sin respuesta del modelo.';
  }

  return 'Se alcanzó el límite máximo de iteraciones del agente. Intentá reformular tu pregunta.';
}