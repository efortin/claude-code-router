/**
 * OpenAI Stream Processor
 *
 * Processes OpenAI-format streaming responses and handles tool calls.
 * This processor detects when an OpenAI-compatible model returns tool_calls
 * and coordinates execution of those tools through the agent system.
 */

import { IAgent } from '../agents/type';
import {
  OpenAIToolCall,
  OpenAIStreamChunk,
  isOpenAIToolCallChunk,
  parseOpenAIToolCallStream,
} from './openaiToolConverter';
import { OpenAIToolCallHandler } from './openaiToolHandler';

export interface OpenAIStreamProcessorOptions {
  agents: IAgent[];
  config: Record<string, unknown>;
  req: unknown;
}

export interface ProcessedToolCall {
  toolUseBlock: {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  toolResult: {
    type: 'tool_result';
    tool_use_id: string;
    content: string | Record<string, unknown>;
  };
}

/**
 * Processor for handling OpenAI-format streaming responses with tool calls
 */
export class OpenAIStreamProcessor {
  private toolCallParser = parseOpenAIToolCallStream();
  private toolHandler: OpenAIToolCallHandler;
  private options: OpenAIStreamProcessorOptions;
  private isCollectingToolCalls = false;
  private finishReason: string | null = null;

  constructor(options: OpenAIStreamProcessorOptions) {
    this.options = options;
    this.toolHandler = new OpenAIToolCallHandler(options.agents, options.config);
  }

  /**
   * Check if an SSE event contains OpenAI-format data
   */
  isOpenAIFormat(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    // OpenAI format has 'choices' array at top level
    return (
      'choices' in d || (d.data && typeof d.data === 'object' && 'choices' in (d.data as object))
    );
  }

  /**
   * Extract the OpenAI chunk from SSE data
   */
  extractOpenAIChunk(data: unknown): OpenAIStreamChunk | null {
    if (!data || typeof data !== 'object') return null;

    const d = data as Record<string, unknown>;

    // Direct OpenAI format
    if ('choices' in d) {
      return d as OpenAIStreamChunk;
    }

    // Wrapped in SSE data field
    if (d.data && typeof d.data === 'object' && 'choices' in (d.data as object)) {
      return d.data as OpenAIStreamChunk;
    }

    return null;
  }

  /**
   * Process an SSE event that may contain OpenAI tool calls
   * Returns true if this event was handled (tool call related)
   */
  processEvent(data: unknown): boolean {
    const chunk = this.extractOpenAIChunk(data);
    if (!chunk) return false;

    // Check for tool calls first
    if (isOpenAIToolCallChunk(chunk)) {
      this.isCollectingToolCalls = true;
      this.toolCallParser.processChunk(chunk);
      return true;
    }

    // Check for finish reason (re-check chunk to avoid TypeScript narrowing issue)
    const chunkWithChoices = chunk as OpenAIStreamChunk;
    const firstChoice = chunkWithChoices.choices?.[0];
    if (firstChoice?.finish_reason) {
      this.finishReason = firstChoice.finish_reason;

      // If we were collecting tool calls and hit a finish, don't suppress the event
      // The caller should check hasToolCalls() after processing
      if (this.finishReason === 'tool_calls' || this.finishReason === 'function_call') {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if we have accumulated any tool calls
   */
  hasToolCalls(): boolean {
    return this.toolCallParser.hasToolCalls();
  }

  /**
   * Get the finish reason from the stream
   */
  getFinishReason(): string | null {
    return this.finishReason;
  }

  /**
   * Process all accumulated tool calls and return results
   */
  async executeToolCalls(): Promise<ProcessedToolCall[]> {
    const toolCalls = this.toolCallParser.getToolCalls();
    const results: ProcessedToolCall[] = [];

    for (const tc of toolCalls) {
      const toolUseBlock = this.toolHandler.buildAnthropicToolUseBlock(tc);
      const toolResult = await this.toolHandler.processToolCall(tc, { req: this.options.req });

      results.push({
        toolUseBlock,
        toolResult,
      });
    }

    return results;
  }

  /**
   * Get the web search count for usage reporting
   */
  getWebSearchCount(): number {
    return this.toolHandler.getWebSearchCount();
  }

  /**
   * Get the raw tool calls (useful for building assistant messages)
   */
  getToolCalls(): OpenAIToolCall[] {
    return this.toolCallParser.getToolCalls();
  }

  /**
   * Reset the processor state
   */
  reset(): void {
    this.toolCallParser.reset();
    this.toolHandler.resetWebSearchCount();
    this.isCollectingToolCalls = false;
    this.finishReason = null;
  }
}

/**
 * Factory function to create a stream processor
 */
export function createOpenAIStreamProcessor(
  options: OpenAIStreamProcessorOptions
): OpenAIStreamProcessor {
  return new OpenAIStreamProcessor(options);
}
