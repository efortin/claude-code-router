/**
 * OpenAI Tool Call Handler
 *
 * Processes OpenAI-format tool calls from streaming responses,
 * executes the appropriate agent handlers, and converts results
 * back to Anthropic format.
 */

import { IAgent } from '../agents/type';
import {
  OpenAIToolCall,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  openAIToolCallToAnthropic,
} from './openaiToolConverter';

export interface ToolCallContext {
  req?: unknown;
  [key: string]: unknown;
}

/**
 * Handler for processing OpenAI-style tool calls with registered agents
 */
export class OpenAIToolCallHandler {
  private agents: IAgent[];
  private config: Record<string, unknown>;
  private webSearchCount: number = 0;

  constructor(agents: IAgent[], config: Record<string, unknown>) {
    this.agents = agents;
    this.config = config;
  }

  /**
   * Find the agent that provides a specific tool
   */
  findAgentForTool(toolName: string): IAgent | undefined {
    return this.agents.find((agent) => agent.tools.has(toolName));
  }

  /**
   * Convert an OpenAI tool call to Anthropic tool_use block
   */
  buildAnthropicToolUseBlock(toolCall: OpenAIToolCall): AnthropicToolUseBlock {
    return openAIToolCallToAnthropic(toolCall);
  }

  /**
   * Process a single tool call and return the result
   */
  async processToolCall(
    toolCall: OpenAIToolCall,
    context: ToolCallContext
  ): Promise<AnthropicToolResultBlock> {
    const toolName = toolCall.function.name;
    const agent = this.findAgentForTool(toolName);

    if (!agent) {
      return {
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: `Tool not found: ${toolName}`,
      };
    }

    const tool = agent.tools.get(toolName);
    if (!tool) {
      return {
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: `Tool not found: ${toolName}`,
      };
    }

    // Parse arguments
    let args: Record<string, unknown> = {};
    try {
      if (toolCall.function.arguments) {
        args = JSON.parse(toolCall.function.arguments);
      }
    } catch {
      // If parsing fails, use empty object
      args = {};
    }

    // Track web search calls
    if (toolName === 'WebSearch' || toolName === 'web_search') {
      this.webSearchCount++;
    }

    // Execute the tool handler
    try {
      const result = await tool.handler(args, {
        ...context,
        config: this.config,
      });

      return {
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: `Error executing tool ${toolName}: ${errorMessage}`,
      };
    }
  }

  /**
   * Process multiple tool calls in parallel
   */
  async processMultipleToolCalls(
    toolCalls: OpenAIToolCall[],
    context: ToolCallContext
  ): Promise<AnthropicToolResultBlock[]> {
    return Promise.all(toolCalls.map((tc) => this.processToolCall(tc, context)));
  }

  /**
   * Get the count of web_search tool calls processed
   */
  getWebSearchCount(): number {
    return this.webSearchCount;
  }

  /**
   * Reset the web search count
   */
  resetWebSearchCount(): void {
    this.webSearchCount = 0;
  }
}
