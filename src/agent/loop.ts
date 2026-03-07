import { generateCompletion } from '../llm/generate.js';
import { getMessagesByUser, saveMessage } from '../db/index.js';
import { tools } from './tools.js';

const MAX_ITERATIONS = 5;

/**
 * Main agent loop. Takes a user message, talks to the LLM, executes 
 * tools if necessary, and loops back until the LLM decides to stop.
 */
export async function runAgentLoop(userId: string, userMessage: string): Promise<string> {
  // 1. Save user msg to the database
  await saveMessage({
    user_id: userId,
    role: 'user',
    content: userMessage,
    name: null,
    tool_calls: null,
    tool_call_id: null,
  });

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`[Agent Loop] Iteration ${iterations} for user ${userId}`);

    // 2. Fetch history
    const history = await getMessagesByUser(userId);

    // 3. Call the unified LLM adapter
    try {
      const { content, tool_calls } = await generateCompletion(userId, history, tools);

      // 4. Save LLM response to history
      await saveMessage({
        user_id: userId,
        role: 'assistant',
        content: content || '',
        name: null,
        tool_calls: tool_calls ? JSON.stringify(tool_calls) : null,
        tool_call_id: null,
      });

      // 5. Check if LLM wanted to call tools
      if (tool_calls && tool_calls.length > 0) {
        for (const toolCall of tool_calls) {
          const functionName = toolCall.name;
          const argsStr = typeof toolCall.args === 'string' ? toolCall.args : JSON.stringify(toolCall.args);
          const args = JSON.parse(argsStr || '{}');

          console.log(`[Agent Loop] Executing tool: ${functionName}`);

          const tool = tools[functionName];
          let toolResult = '';

          if (tool) {
            try {
              toolResult = await tool.execute(args);
            } catch (err: any) {
              toolResult = `Error executing tool: ${err.message}`;
              console.error(`[Agent Loop] Tool error:`, err);
            }
          } else {
            toolResult = `Error: Tool ${functionName} not found.`;
          }

          // 6. Save the tool result to history
          await saveMessage({
            user_id: userId,
            role: 'tool',
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            name: functionName,
            tool_calls: null,
            tool_call_id: toolCall.id,
          });
        }
        
        // Loop again because we generated a tool response
        continue; 
      }

      // 7. If no tool calls, this is the final answer!
      return content || 'Sin respuesta del modelo.';

    } catch (error: any) {
      console.error('[Agent Loop] LLM API Error:', error);
      return "Ocurrió un error al procesar tu solicitud con el modelo de lenguaje (revisa tus variables de entorno y API keys).";
    }
  }

  return "Se alcanzó el límite máximo de pensamiento del agente (loop limit). Por favor, formula tu pregunta de otra manera.";
}