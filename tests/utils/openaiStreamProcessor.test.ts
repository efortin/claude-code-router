/**
 * Tests for OpenAI Stream Processor
 */

import { createOpenAIStreamProcessor } from '../../src/utils/openaiStreamProcessor';
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

describe('OpenAIStreamProcessor', () => {
  describe('isOpenAIFormat', () => {
    it('should detect direct OpenAI format', () => {
      const processor = createOpenAIStreamProcessor({
        agents: [],
        config: {},
        req: {},
      });

      const openAIData = {
        choices: [{ delta: { content: 'test' } }],
      };

      expect(processor.isOpenAIFormat(openAIData)).toBe(true);
    });

    it('should detect wrapped OpenAI format in SSE data', () => {
      const processor = createOpenAIStreamProcessor({
        agents: [],
        config: {},
        req: {},
      });

      const wrappedData = {
        data: {
          choices: [{ delta: { content: 'test' } }],
        },
      };

      expect(processor.isOpenAIFormat(wrappedData)).toBe(true);
    });

    it('should return false for Anthropic format', () => {
      const processor = createOpenAIStreamProcessor({
        agents: [],
        config: {},
        req: {},
      });

      const anthropicData = {
        event: 'content_block_delta',
        data: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'test' } },
      };

      expect(processor.isOpenAIFormat(anthropicData)).toBe(false);
    });
  });

  describe('processEvent', () => {
    it('should detect and accumulate tool calls', () => {
      const processor = createOpenAIStreamProcessor({
        agents: [],
        config: {},
        req: {},
      });

      const toolCallChunk = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{"query": "test"}',
                  },
                },
              ],
            },
          },
        ],
      };

      const handled = processor.processEvent(toolCallChunk);

      expect(handled).toBe(true);
      expect(processor.hasToolCalls()).toBe(true);
    });

    it('should handle streaming tool call arguments', () => {
      const processor = createOpenAIStreamProcessor({
        agents: [],
        config: {},
        req: {},
      });

      // First chunk with partial arguments
      processor.processEvent({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_stream',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{"que',
                  },
                },
              ],
            },
          },
        ],
      });

      // Second chunk with rest of arguments
      processor.processEvent({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: 'ry": "hello"}',
                  },
                },
              ],
            },
          },
        ],
      });

      const toolCalls = processor.getToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].function.arguments).toBe('{"query": "hello"}');
    });

    it('should detect finish reason', () => {
      const processor = createOpenAIStreamProcessor({
        agents: [],
        config: {},
        req: {},
      });

      processor.processEvent({
        choices: [
          {
            delta: {},
            finish_reason: 'tool_calls',
          },
        ],
      });

      expect(processor.getFinishReason()).toBe('tool_calls');
    });
  });

  describe('executeToolCalls', () => {
    it('should execute accumulated tool calls and return results', async () => {
      const mockHandler = jest.fn().mockResolvedValue('Search results: item1');
      const mockAgent = createMockAgent('web_search', mockHandler);

      const processor = createOpenAIStreamProcessor({
        agents: [mockAgent],
        config: { websearch_api: 'http://test' },
        req: {},
      });

      // Add a tool call
      processor.processEvent({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_exec',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{"query": "test query"}',
                  },
                },
              ],
            },
          },
        ],
      });

      const results = await processor.executeToolCalls();

      expect(results).toHaveLength(1);
      expect(results[0].toolUseBlock).toEqual({
        type: 'tool_use',
        id: 'call_exec',
        name: 'web_search',
        input: { query: 'test query' },
      });
      expect(results[0].toolResult.content).toBe('Search results: item1');
    });

    it('should track web search count', async () => {
      const mockHandler = jest.fn().mockResolvedValue('results');
      const mockAgent = createMockAgent('web_search', mockHandler);

      const processor = createOpenAIStreamProcessor({
        agents: [mockAgent],
        config: { websearch_api: 'http://test' },
        req: {},
      });

      processor.processEvent({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_ws',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      });

      await processor.executeToolCalls();

      expect(processor.getWebSearchCount()).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      const mockHandler = jest.fn().mockResolvedValue('results');
      const mockAgent = createMockAgent('web_search', mockHandler);

      const processor = createOpenAIStreamProcessor({
        agents: [mockAgent],
        config: {},
        req: {},
      });

      processor.processEvent({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_reset',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      });

      expect(processor.hasToolCalls()).toBe(true);

      processor.reset();

      expect(processor.hasToolCalls()).toBe(false);
      expect(processor.getWebSearchCount()).toBe(0);
      expect(processor.getFinishReason()).toBeNull();
    });
  });
});
