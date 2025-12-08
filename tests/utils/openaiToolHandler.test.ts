/**
 * Tests for OpenAI Tool Call Handler
 *
 * This handler processes OpenAI-format tool calls from streaming responses,
 * executes the appropriate agent handlers, and converts results back to
 * the format expected by the client (Anthropic format).
 */

import { OpenAIToolCallHandler } from '../../src/utils/openaiToolHandler';
import { IAgent, ITool } from '../../src/agents/type';

// Mock agent for testing
const createMockAgent = (toolName: string, handler: ITool['handler']): IAgent => ({
  name: 'mock-agent',
  tools: new Map([
    [
      toolName,
      {
        name: toolName,
        description: 'Mock tool for testing',
        input_schema: { type: 'object', properties: {} },
        handler,
      },
    ],
  ]),
  shouldHandle: () => true,
  reqHandler: () => {},
});

describe('OpenAIToolCallHandler', () => {
  describe('processToolCall', () => {
    it('should execute agent handler and return result', async () => {
      const mockHandler = jest.fn().mockResolvedValue('Search results: item1, item2');
      const mockAgent = createMockAgent('web_search', mockHandler);

      const handler = new OpenAIToolCallHandler([mockAgent], { websearch_api: 'http://test' });

      const toolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'web_search',
          arguments: '{"query": "test query"}',
        },
      };

      const result = await handler.processToolCall(toolCall, {});

      expect(mockHandler).toHaveBeenCalledWith(
        { query: 'test query' },
        expect.objectContaining({ config: { websearch_api: 'http://test' } })
      );
      expect(result).toEqual({
        tool_use_id: 'call_123',
        type: 'tool_result',
        content: 'Search results: item1, item2',
      });
    });

    it('should return error result when tool not found', async () => {
      const handler = new OpenAIToolCallHandler([], {});

      const toolCall = {
        id: 'call_unknown',
        type: 'function',
        function: {
          name: 'unknown_tool',
          arguments: '{}',
        },
      };

      const result = await handler.processToolCall(toolCall, {});

      expect(result.type).toBe('tool_result');
      expect(result.tool_use_id).toBe('call_unknown');
      expect(result.content).toContain('Tool not found');
    });

    it('should handle handler errors gracefully', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      const mockAgent = createMockAgent('failing_tool', mockHandler);

      const handler = new OpenAIToolCallHandler([mockAgent], {});

      const toolCall = {
        id: 'call_fail',
        type: 'function',
        function: {
          name: 'failing_tool',
          arguments: '{}',
        },
      };

      const result = await handler.processToolCall(toolCall, {});

      expect(result.type).toBe('tool_result');
      expect(result.content).toContain('Error');
    });

    it('should handle malformed arguments', async () => {
      const mockHandler = jest.fn().mockResolvedValue('success');
      const mockAgent = createMockAgent('test_tool', mockHandler);

      const handler = new OpenAIToolCallHandler([mockAgent], {});

      const toolCall = {
        id: 'call_bad_args',
        type: 'function',
        function: {
          name: 'test_tool',
          arguments: '{invalid}',
        },
      };

      await handler.processToolCall(toolCall, {});

      // Should still call handler with empty object
      expect(mockHandler).toHaveBeenCalledWith({}, expect.anything());
    });
  });

  describe('processMultipleToolCalls', () => {
    it('should process multiple tool calls in parallel', async () => {
      const handler1 = jest.fn().mockResolvedValue('Result 1');
      const handler2 = jest.fn().mockResolvedValue('Result 2');

      const agent1 = createMockAgent('tool1', handler1);
      const agent2 = createMockAgent('tool2', handler2);

      const handler = new OpenAIToolCallHandler([agent1, agent2], {});

      const toolCalls = [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'tool1', arguments: '{}' },
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'tool2', arguments: '{}' },
        },
      ];

      const results = await handler.processMultipleToolCalls(toolCalls, {});

      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('Result 1');
      expect(results[1].content).toBe('Result 2');
    });
  });

  describe('findAgentForTool', () => {
    it('should find the correct agent for a tool', () => {
      const mockHandler = jest.fn();
      const agent = createMockAgent('specific_tool', mockHandler);

      const handler = new OpenAIToolCallHandler([agent], {});

      const found = handler.findAgentForTool('specific_tool');
      expect(found).toBe(agent);
    });

    it('should return undefined for unknown tool', () => {
      const handler = new OpenAIToolCallHandler([], {});

      const found = handler.findAgentForTool('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('buildAnthropicToolUseBlock', () => {
    it('should convert OpenAI tool call to Anthropic content block', () => {
      const handler = new OpenAIToolCallHandler([], {});

      const toolCall = {
        id: 'call_abc',
        type: 'function',
        function: {
          name: 'web_search',
          arguments: '{"query": "test"}',
        },
      };

      const block = handler.buildAnthropicToolUseBlock(toolCall);

      expect(block).toEqual({
        type: 'tool_use',
        id: 'call_abc',
        name: 'web_search',
        input: { query: 'test' },
      });
    });
  });

  describe('getWebSearchCount', () => {
    it('should track web_search tool calls', async () => {
      const mockHandler = jest.fn().mockResolvedValue('results');
      const agent = createMockAgent('web_search', mockHandler);

      const handler = new OpenAIToolCallHandler([agent], { websearch_api: 'http://test' });

      expect(handler.getWebSearchCount()).toBe(0);

      await handler.processToolCall(
        {
          id: 'call_ws1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query": "q1"}' },
        },
        {}
      );

      expect(handler.getWebSearchCount()).toBe(1);

      await handler.processToolCall(
        {
          id: 'call_ws2',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query": "q2"}' },
        },
        {}
      );

      expect(handler.getWebSearchCount()).toBe(2);
    });

    it('should not count non-web_search tools', async () => {
      const mockHandler = jest.fn().mockResolvedValue('result');
      const agent = createMockAgent('other_tool', mockHandler);

      const handler = new OpenAIToolCallHandler([agent], {});

      await handler.processToolCall(
        {
          id: 'call_other',
          type: 'function',
          function: { name: 'other_tool', arguments: '{}' },
        },
        {}
      );

      expect(handler.getWebSearchCount()).toBe(0);
    });

    it('should reset count correctly', async () => {
      const mockHandler = jest.fn().mockResolvedValue('results');
      const agent = createMockAgent('web_search', mockHandler);

      const handler = new OpenAIToolCallHandler([agent], { websearch_api: 'http://test' });

      await handler.processToolCall(
        {
          id: 'call_ws',
          type: 'function',
          function: { name: 'web_search', arguments: '{}' },
        },
        {}
      );

      expect(handler.getWebSearchCount()).toBe(1);

      handler.resetWebSearchCount();

      expect(handler.getWebSearchCount()).toBe(0);
    });
  });
});
