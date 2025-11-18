import { calculateTokenCount } from '../../src/utils/router';
import { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';

describe('Router Scenarios and Edge Cases', () => {
  describe('calculateTokenCount - Comprehensive Scenarios', () => {
    // Test various realistic message structures
    it('should handle realistic Claude API message structures', () => {
      const messages: MessageParam[] = [
        {
          role: 'user',
          content: 'Please help me debug this code: \n```javascript\nconsole.log("hello");\n```\nWhat might be wrong?'
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Looking at your code, I can see a couple of potential issues:'
            },
            {
              type: 'tool_use',
              id: 'tool1',
              name: 'code_analysis',
              input: {
                code: 'console.log("hello");',
                language: 'javascript'
              }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool1',
              content: 'Analysis result: The code looks syntactically correct.'
            }
          ]
        }
      ];

      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle large payloads efficiently', () => {
      // Create a large message with many tokens
      const longText = 'This is a test message with repeated content. '.repeat(100);
      const messages: MessageParam[] = [
        {
          role: 'user',
          content: longText
        }
      ];

      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(800); // Should be substantial (adjusted for actual count)
    });

    it('should handle international character sets', () => {
      const messages: MessageParam[] = [
        {
          role: 'user',
          content: 'Hello 世界 🌍 Привет мир 👋'
        }
      ];

      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle special characters and symbols', () => {
      const messages: MessageParam[] = [
        {
          role: 'user',
          content: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\'\\'
        }
      ];

      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle empty and whitespace-only content', () => {
      const messages: MessageParam[] = [
        {
          role: 'user',
          content: '   '
        },
        {
          role: 'assistant',
          content: ''
        }
      ];

      const count = calculateTokenCount(messages, [], []);
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex tool schemas', () => {
      const tools: Tool[] = [
        {
          name: 'web_search',
          description: 'Search the web for information',
          input_schema: {
            type: 'object' as const,
            properties: {
              query: {
                type: 'string',
                description: 'The search query'
              },
              limit: {
                type: 'integer',
                description: 'Maximum number of results'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'data_visualization',
          description: 'Create charts and graphs from data',
          input_schema: {
            type: 'object' as const,
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' }
                  }
                }
              },
              chart_type: {
                type: 'string',
                enum: ['bar', 'line', 'pie']
              }
            },
            required: ['data']
          }
        }
      ];

      const count = calculateTokenCount([], [], tools);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('Cross-Module Integration Tests', () => {
    // Test that functions work well together
    it('should properly calculate tokens for complex interaction patterns', () => {
      const messages: MessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Can you analyze this code?' },
            { type: 'text', text: '```javascript\nfunction test() {\n  return true;\n}\n```' }
          ]
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool1',
              name: 'code_analyzer',
              input: {
                function_name: 'test',
                code: 'function test() {\n  return true;\n}'
              }
            }
          ]
        }
      ];

      const system = [
        { type: 'text', text: 'You are a helpful code assistant.' }
      ];

      const tools: Tool[] = [
        {
          name: 'code_analyzer',
          description: 'Analyze JavaScript code',
          input_schema: {
            type: 'object' as const,
            properties: {
              function_name: { type: 'string' },
              code: { type: 'string' }
            },
            required: ['function_name', 'code']
          }
        }
      ];

      const tokenCount = calculateTokenCount(messages, system, tools);
      expect(tokenCount).toBeGreaterThan(0);
      expect(tokenCount).toBeLessThan(10000); // Reasonable upper bound
    });
  });
});