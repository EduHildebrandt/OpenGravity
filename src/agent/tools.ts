/**
 * @file src/agent/tools.ts
 * @description Tool registry for the OpenGravity agent.
 *
 * To add a new tool:
 *   1. Create an `AgentTool` object following the pattern below.
 *   2. Add it to the `tools` registry at the bottom of this file.
 *
 * The agent loop in `src/agent/loop.ts` picks up all tools automatically.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Contract that every agent tool must satisfy. */
export interface AgentTool {
  /** Unique identifier used by the LLM to call this tool. */
  name: string;
  /** Human-readable description sent to the LLM so it knows when to use it. */
  description: string;
  /** JSON-Schema describing the arguments object. */
  parameters: Record<string, any>;
  /** The actual implementation called when the LLM invokes the tool. */
  execute: (args: Record<string, any>) => Promise<string> | string;
}

// ---------------------------------------------------------------------------
// Tool Implementations
// ---------------------------------------------------------------------------

/**
 * Returns the current UTC date and time as an ISO 8601 string.
 * Useful whenever the LLM needs to calculate times or durations.
 */
const getCurrentTimeTool: AgentTool = {
  name: 'get_current_time',
  description: 'Devuelve la fecha y hora actual del sistema en formato ISO 8601 (UTC).',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: () => new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

/**
 * All available tools indexed by their `name`.
 * Add new tools by inserting entries here — the agent loop discovers them automatically.
 */
export const tools: Record<string, AgentTool> = {
  [getCurrentTimeTool.name]: getCurrentTimeTool,
};