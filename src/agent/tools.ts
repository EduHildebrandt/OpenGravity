import Groq from 'groq-sdk';

/**
 * Interface definition for Agent Tools
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON schema
  execute: (args: Record<string, any>) => Promise<string> | string;
}

/**
 * Implementation of a simple time tool
 */
const getCurrentTimeTool: AgentTool = {
  name: 'get_current_time',
  description: 'Devuelve la hora y fecha actual del sistema local.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: () => {
    return new Date().toISOString();
  },
};

/**
 * Tool registry 
 */
export const tools: Record<string, AgentTool> = {
  [getCurrentTimeTool.name]: getCurrentTimeTool,
};

/**
 * Maps the toolkit to the format Groq API expects
 */
export const formattedTools: Groq.Chat.Completions.ChatCompletionTool[] = Object.values(tools).map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));