import { calculateTokenCount } from '../../src/utils/router';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages';

describe('calculateTokenCount - Edge Cases', () => {
  it('should handle null/undefined inputs gracefully', () => {
    // Test with null inputs
    const count1 = calculateTokenCount(null as any, null, null);
    expect(count1).toBe(0);

    // Test with undefined inputs
    const count2 = calculateTokenCount(undefined as any, undefined, undefined);
    expect(count2).toBe(0);
  });

  it('should handle empty arrays properly', () => {
    const messages: MessageParam[] = [];
    const count = calculateTokenCount(messages, [], []);
    expect(count).toBe(0);
  });

  it('should handle messages with empty content', () => {
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: ''
      }
    ];

    const count = calculateTokenCount(messages, [], []);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('should handle messages with empty content arrays', () => {
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: []
      }
    ];

    const count = calculateTokenCount(messages, [], []);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('should handle complex nested content structures', () => {
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: '' }, // Empty text
          { type: 'text', text: 'World' }
        ]
      }
    ];

    const count = calculateTokenCount(messages, [], []);
    expect(count).toBeGreaterThan(0);
  });

  it('should handle deeply nested tool use structures', () => {
    const messages: MessageParam[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool1',
            name: 'complex_tool',
            input: {
              nested: {
                property: 'value',
                array: ['item1', 'item2']
              }
            }
          }
        ]
      }
    ];

    const count = calculateTokenCount(messages, [], []);
    expect(count).toBeGreaterThan(0);
  });

  it('should handle tool_result with complex content', () => {
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool1',
            content: 'tool result'
          }
        ]
      }
    ];

    const count = calculateTokenCount(messages, [], []);
    expect(count).toBeGreaterThan(0);
  });

  it('should handle system prompts with various formats', () => {
    // String system prompt
    const count1 = calculateTokenCount([], 'Simple system prompt', []);
    expect(count1).toBeGreaterThan(0);

    // Array system prompt
    const count2 = calculateTokenCount([], [{ type: 'text', text: 'Array system prompt' }], []);
    expect(count2).toBeGreaterThan(0);

    // Empty array system prompt
    const count3 = calculateTokenCount([], [], []);
    expect(count3).toBe(0);
  });

  it('should handle tools with complex schemas', () => {
    const tools = [
      {
        name: 'complex_tool',
        description: 'A tool with a complex description',
        input_schema: {
          type: 'object' as const,
          properties: {
            param1: { type: 'string' },
            param2: { type: 'integer' },
            nested: {
              type: 'object' as const,
              properties: {
                deep: { type: 'boolean' }
              }
            }
          },
          required: ['param1']
        }
      }
    ];

    const count = calculateTokenCount([], [], tools);
    expect(count).toBeGreaterThan(0);
  });

  it('should handle mixed content types', () => {
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Text content' },
          {
            type: 'tool_use',
            id: 'tool1',
            name: 'test_tool',
            input: { param: 'value' }
          },
          {
            type: 'tool_result',
            tool_use_id: 'tool1',
            content: 'tool result'
          }
        ]
      }
    ];

    const count = calculateTokenCount(messages, [], []);
    expect(count).toBeGreaterThan(0);
  });
});