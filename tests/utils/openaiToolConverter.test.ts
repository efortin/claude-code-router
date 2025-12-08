/**
 * Tests for OpenAI Tool Format Converter
 *
 * These utilities convert between Anthropic and OpenAI tool formats:
 * - Anthropic tool -> OpenAI function
 * - OpenAI tool_calls response -> Anthropic tool_use
 * - Anthropic tool_result -> OpenAI tool response
 */

import {
  anthropicToolToOpenAI,
  openAIToolCallToAnthropic,
  anthropicToolResultToOpenAI,
  openAIToolResponseToAnthropic,
  isOpenAIToolCallChunk,
  parseOpenAIToolCallStream,
  AnthropicToolResultBlock,
  OpenAIToolMessage,
} from '../../src/utils/openaiToolConverter';

describe('OpenAI Tool Converter', () => {
  describe('anthropicToolToOpenAI', () => {
    it('should convert Anthropic tool definition to OpenAI function format', () => {
      const anthropicTool = {
        name: 'web_search',
        description: 'Search the web for information',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
          },
          required: ['query'],
        },
      };

      const result = anthropicToolToOpenAI(anthropicTool);

      expect(result).toEqual({
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
            },
            required: ['query'],
          },
        },
      });
    });

    it('should handle tool with no description', () => {
      const anthropicTool = {
        name: 'simple_tool',
        input_schema: {
          type: 'object',
          properties: {},
        },
      };

      const result = anthropicToolToOpenAI(anthropicTool);

      expect(result.function.name).toBe('simple_tool');
      expect(result.function.description).toBeUndefined();
    });

    it('should convert array of Anthropic tools', () => {
      const anthropicTools = [
        {
          name: 'tool1',
          description: 'First tool',
          input_schema: { type: 'object', properties: {} },
        },
        {
          name: 'tool2',
          description: 'Second tool',
          input_schema: { type: 'object', properties: {} },
        },
      ];

      const results = anthropicTools.map(anthropicToolToOpenAI);

      expect(results).toHaveLength(2);
      expect(results[0].function.name).toBe('tool1');
      expect(results[1].function.name).toBe('tool2');
    });
  });

  describe('openAIToolCallToAnthropic', () => {
    it('should convert OpenAI tool_call to Anthropic tool_use block', () => {
      const openAIToolCall = {
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'web_search',
          arguments: '{"query": "test search"}',
        },
      };

      const result = openAIToolCallToAnthropic(openAIToolCall);

      expect(result).toEqual({
        type: 'tool_use',
        id: 'call_abc123',
        name: 'web_search',
        input: { query: 'test search' },
      });
    });

    it('should handle malformed JSON arguments gracefully', () => {
      const openAIToolCall = {
        id: 'call_xyz789',
        type: 'function',
        function: {
          name: 'broken_tool',
          arguments: '{invalid json}',
        },
      };

      const result = openAIToolCallToAnthropic(openAIToolCall);

      expect(result.type).toBe('tool_use');
      expect(result.id).toBe('call_xyz789');
      expect(result.name).toBe('broken_tool');
      expect(result.input).toEqual({});
    });

    it('should handle empty arguments', () => {
      const openAIToolCall = {
        id: 'call_empty',
        type: 'function',
        function: {
          name: 'no_args_tool',
          arguments: '',
        },
      };

      const result = openAIToolCallToAnthropic(openAIToolCall);

      expect(result.input).toEqual({});
    });
  });

  describe('anthropicToolResultToOpenAI', () => {
    it('should convert Anthropic tool_result to OpenAI tool message', () => {
      const anthropicToolResult: AnthropicToolResultBlock = {
        type: 'tool_result',
        tool_use_id: 'call_abc123',
        content: 'Search results: Found 5 items',
      };

      const result = anthropicToolResultToOpenAI(anthropicToolResult);

      expect(result).toEqual({
        role: 'tool',
        tool_call_id: 'call_abc123',
        content: 'Search results: Found 5 items',
      });
    });

    it('should handle object content by stringifying', () => {
      const anthropicToolResult: AnthropicToolResultBlock = {
        type: 'tool_result',
        tool_use_id: 'call_obj',
        content: { results: ['item1', 'item2'] },
      };

      const result = anthropicToolResultToOpenAI(anthropicToolResult);

      expect(result.role).toBe('tool');
      expect(result.content).toBe('{"results":["item1","item2"]}');
    });
  });

  describe('openAIToolResponseToAnthropic', () => {
    it('should convert OpenAI tool message to Anthropic tool_result', () => {
      const openAIToolMessage: OpenAIToolMessage = {
        role: 'tool',
        tool_call_id: 'call_abc123',
        content: 'Tool execution result',
      };

      const result = openAIToolResponseToAnthropic(openAIToolMessage);

      expect(result).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_abc123',
        content: 'Tool execution result',
      });
    });
  });

  describe('isOpenAIToolCallChunk', () => {
    it('should return true for chunk with tool_calls', () => {
      const chunk = {
        choices: [
          {
            delta: {
              tool_calls: [{ id: 'call_1', function: { name: 'test' } }],
            },
          },
        ],
      };

      expect(isOpenAIToolCallChunk(chunk)).toBe(true);
    });

    it('should return false for chunk without tool_calls', () => {
      const chunk = {
        choices: [
          {
            delta: {
              content: 'Hello',
            },
          },
        ],
      };

      expect(isOpenAIToolCallChunk(chunk)).toBe(false);
    });

    it('should return false for empty choices', () => {
      const chunk = { choices: [] };
      expect(isOpenAIToolCallChunk(chunk)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isOpenAIToolCallChunk(null)).toBe(false);
      expect(isOpenAIToolCallChunk(undefined)).toBe(false);
    });
  });

  describe('parseOpenAIToolCallStream', () => {
    it('should accumulate tool call arguments from stream chunks', () => {
      const parser = parseOpenAIToolCallStream();

      // First chunk - tool call start
      const chunk1 = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_stream1',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{"qu',
                  },
                },
              ],
            },
          },
        ],
      };

      // Second chunk - arguments continuation
      const chunk2 = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: 'ery": "te',
                  },
                },
              ],
            },
          },
        ],
      };

      // Third chunk - arguments end
      const chunk3 = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: 'st"}',
                  },
                },
              ],
            },
          },
        ],
      };

      parser.processChunk(chunk1);
      parser.processChunk(chunk2);
      parser.processChunk(chunk3);

      const toolCalls = parser.getToolCalls();

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].id).toBe('call_stream1');
      expect(toolCalls[0].function.name).toBe('web_search');
      expect(toolCalls[0].function.arguments).toBe('{"query": "test"}');
    });

    it('should handle multiple parallel tool calls', () => {
      const parser = parseOpenAIToolCallStream();

      const chunk = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'tool1',
                    arguments: '{"a": 1}',
                  },
                },
                {
                  index: 1,
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'tool2',
                    arguments: '{"b": 2}',
                  },
                },
              ],
            },
          },
        ],
      };

      parser.processChunk(chunk);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].function.name).toBe('tool1');
      expect(toolCalls[1].function.name).toBe('tool2');
    });

    it('should reset state correctly', () => {
      const parser = parseOpenAIToolCallStream();

      parser.processChunk({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_reset',
                  type: 'function',
                  function: { name: 'test', arguments: '{}' },
                },
              ],
            },
          },
        ],
      });

      expect(parser.getToolCalls()).toHaveLength(1);

      parser.reset();

      expect(parser.getToolCalls()).toHaveLength(0);
    });
  });
});
