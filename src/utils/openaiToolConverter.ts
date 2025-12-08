/**
 * OpenAI Tool Format Converter
 *
 * Utilities for converting between Anthropic and OpenAI tool formats.
 * This enables using Anthropic-style tools with OpenAI-compatible endpoints.
 */

// Types for Anthropic tool format
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Record<string, unknown>;
}

// Types for OpenAI tool format
export interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface OpenAIToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

export interface OpenAIStreamToolCall {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      tool_calls?: OpenAIStreamToolCall[];
      content?: string;
    };
    finish_reason?: string;
  }>;
}

/**
 * Convert an Anthropic tool definition to OpenAI function format
 */
export function anthropicToolToOpenAI(tool: AnthropicTool): OpenAIFunction {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/**
 * Convert an OpenAI tool_call to Anthropic tool_use block
 */
export function openAIToolCallToAnthropic(toolCall: OpenAIToolCall): AnthropicToolUseBlock {
  let input: Record<string, unknown> = {};

  try {
    if (toolCall.function.arguments) {
      input = JSON.parse(toolCall.function.arguments);
    }
  } catch {
    // If JSON parsing fails, use empty object
    input = {};
  }

  return {
    type: 'tool_use',
    id: toolCall.id,
    name: toolCall.function.name,
    input,
  };
}

/**
 * Convert an Anthropic tool_result to OpenAI tool message format
 */
export function anthropicToolResultToOpenAI(result: AnthropicToolResultBlock): OpenAIToolMessage {
  const content =
    typeof result.content === 'string' ? result.content : JSON.stringify(result.content);

  return {
    role: 'tool',
    tool_call_id: result.tool_use_id,
    content,
  };
}

/**
 * Convert an OpenAI tool message to Anthropic tool_result format
 */
export function openAIToolResponseToAnthropic(
  message: OpenAIToolMessage
): AnthropicToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: message.tool_call_id,
    content: message.content,
  };
}

/**
 * Check if an OpenAI stream chunk contains tool calls
 */
export function isOpenAIToolCallChunk(chunk: unknown): chunk is OpenAIStreamChunk {
  if (!chunk || typeof chunk !== 'object') {
    return false;
  }

  const c = chunk as OpenAIStreamChunk;
  return !!(
    c.choices &&
    c.choices.length > 0 &&
    c.choices[0].delta?.tool_calls &&
    c.choices[0].delta.tool_calls.length > 0
  );
}

/**
 * Parser for accumulating OpenAI streaming tool calls
 *
 * OpenAI streams tool calls in chunks where arguments are split across
 * multiple chunks. This parser accumulates them into complete tool calls.
 */
export function parseOpenAIToolCallStream() {
  const toolCalls: Map<number, OpenAIToolCall> = new Map();

  return {
    /**
     * Process a streaming chunk and accumulate tool call data
     */
    processChunk(chunk: OpenAIStreamChunk): void {
      if (!chunk.choices?.[0]?.delta?.tool_calls) {
        return;
      }

      for (const tc of chunk.choices[0].delta.tool_calls) {
        const existing = toolCalls.get(tc.index);

        if (existing) {
          // Accumulate arguments
          if (tc.function?.arguments) {
            existing.function.arguments += tc.function.arguments;
          }
        } else {
          // New tool call
          toolCalls.set(tc.index, {
            id: tc.id || '',
            type: tc.type || 'function',
            function: {
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            },
          });
        }
      }
    },

    /**
     * Get all accumulated tool calls
     */
    getToolCalls(): OpenAIToolCall[] {
      return Array.from(toolCalls.values());
    },

    /**
     * Check if there are any tool calls
     */
    hasToolCalls(): boolean {
      return toolCalls.size > 0;
    },

    /**
     * Reset the parser state
     */
    reset(): void {
      toolCalls.clear();
    },
  };
}
