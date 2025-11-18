/**
 * Integration tests for XMLToolCallTransformStream
 * Verifies: streaming behavior, token counting, sequence order, no regressions
 */

import { XMLToolCallTransformStream } from '../../src/utils/XMLToolCallTransform.stream';
import { SSEParserTransform } from '../../src/utils/SSEParser.transform';
import { SSESerializerTransform } from '../../src/utils/SSESerializer.transform';

describe('XMLToolCallTransformStream - Integration Tests', () => {
  /**
   * Helper to simulate SSE stream processing
   */
  async function processSSEStream(events: any[]): Promise<any[]> {
    const stream = new ReadableStream({
      start(controller) {
        events.forEach(event => controller.enqueue(event));
        controller.close();
      },
    });

    const transformedStream = stream.pipeThrough(new XMLToolCallTransformStream());
    const reader = transformedStream.getReader();
    const results: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    return results;
  }

  /**
   * Helper to convert to SSE text and back
   */
  async function roundTripThroughSSE(events: any[]): Promise<any[]> {
    // Create readable stream
    const inputStream = new ReadableStream({
      start(controller) {
        events.forEach(event => controller.enqueue(event));
        controller.close();
      },
    });

    // Serialize to SSE text
    const serialized = inputStream.pipeThrough(new SSESerializerTransform());
    
    // Convert back to stream of strings
    const textStream = new ReadableStream({
      async start(controller) {
        const reader = serialized.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(new TextEncoder().encode(value));
        }
        controller.close();
      },
    });

    // Parse back
    const parsed = textStream
      .pipeThrough(new SSEParserTransform())
      .pipeThrough(new XMLToolCallTransformStream());

    const reader = parsed.getReader();
    const results: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    return results;
  }

  describe('Streaming Behavior', () => {
    it('should not affect normal text streaming', async () => {
      const events = [
        {
          event: 'message_start',
          data: { type: 'message_start', message: { id: 'msg_1' } },
        },
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: ' world' },
          },
        },
        {
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: 0 },
        },
        {
          event: 'message_stop',
          data: { type: 'message_stop' },
        },
      ];

      const results = await processSSEStream(events);

      // Should pass through unchanged
      expect(results.length).toBe(events.length);
      expect(results[0].event).toBe('message_start');
      expect(results[results.length - 1].event).toBe('message_stop');
    });

    it('should transform XML tool calls in streaming chunks', async () => {
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Let me help. ' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: '<tool_call><tool_name>search</tool_name><tool_arguments>{"q":"test"}</tool_arguments></tool_call>',
            },
          },
        },
      ];

      const results = await processSSEStream(events);

      // Should have: text delta, text stop, tool start, tool delta, tool stop
      const toolStarts = results.filter(
        r => r.event === 'content_block_start' && r.data?.content_block?.type === 'tool_use'
      );
      expect(toolStarts.length).toBeGreaterThan(0);
      expect(toolStarts[0].data.content_block.name).toBe('search');
    });

    it('should maintain content block index sequence', async () => {
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: '<tool_call><tool_name>tool1</tool_name><tool_arguments>{}</tool_arguments></tool_call>',
            },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: '<tool_call><tool_name>tool2</tool_name><tool_arguments>{}</tool_arguments></tool_call>',
            },
          },
        },
      ];

      const results = await processSSEStream(events);

      // Collect all indices
      const indices = results
        .filter(r => r.data?.index !== undefined)
        .map(r => r.data.index);

      // Verify indices are sequential
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
      }
    });
  });

  describe('Token Counting Compatibility', () => {
    it('should preserve exact text content for token counting', async () => {
      const originalText = 'This is a test message for token counting.';
      
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: originalText },
          },
        },
        {
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: 0 },
        },
      ];

      const results = await processSSEStream(events);

      // Extract text from results
      const textDeltas = results
        .filter(r => r.data?.delta?.type === 'text_delta')
        .map(r => r.data.delta.text);
      
      const reconstructedText = textDeltas.join('');

      expect(reconstructedText).toBe(originalText);
    });

    it('should not add or remove whitespace that affects tokens', async () => {
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Word1 Word2  Word3' },
          },
        },
      ];

      const results = await processSSEStream(events);

      const textDelta = results.find(r => r.data?.delta?.type === 'text_delta');
      expect(textDelta.data.delta.text).toBe('Word1 Word2  Word3');
    });

    it('should handle unicode correctly', async () => {
      const unicode = '测试 emoji 👍 special chars éàü';
      
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: unicode },
          },
        },
      ];

      const results = await processSSEStream(events);

      const textDelta = results.find(r => r.data?.delta?.type === 'text_delta');
      expect(textDelta.data.delta.text).toBe(unicode);
    });
  });

  describe('Sequence Order Preservation', () => {
    it('should maintain exact order of events', async () => {
      const events = [
        { event: 'message_start', data: { type: 'message_start' } },
        { event: 'content_block_start', data: { type: 'content_block_start', index: 0 } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0 } },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
        { event: 'message_delta', data: { type: 'message_delta' } },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ];

      const results = await processSSEStream(events);

      // Verify order
      expect(results[0].event).toBe('message_start');
      expect(results[1].event).toBe('content_block_start');
      expect(results[results.length - 1].event).toBe('message_stop');
    });

    it('should interleave text and tool calls in correct order', async () => {
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'A' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: '<tool_call><tool_name>t1</tool_name><tool_arguments>{}</tool_arguments></tool_call>',
            },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'B' },
          },
        },
      ];

      const results = await processSSEStream(events);

      // Build sequence of what we received
      const sequence: string[] = [];
      results.forEach(r => {
        if (r.data?.delta?.type === 'text_delta') {
          sequence.push('text:' + r.data.delta.text);
        } else if (r.data?.content_block?.type === 'tool_use') {
          sequence.push('tool:' + r.data.content_block.name);
        }
      });

      // Verify order: text(A), tool(t1), text(B)
      expect(sequence.filter(s => s.startsWith('text'))[0]).toContain('A');
      expect(sequence.filter(s => s.startsWith('tool'))[0]).toContain('t1');
      expect(sequence.filter(s => s.startsWith('text')).pop()).toContain('B');
    });
  });

  describe('No Regressions', () => {
    it('should not affect existing tool_use blocks', async () => {
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'existing_tool',
              input: {},
            },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '{"key":"value"}',
            },
          },
        },
        {
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: 0 },
        },
      ];

      const results = await processSSEStream(events);

      // Should pass through unchanged
      expect(results).toEqual(events);
    });

    it('should handle message_start and message_stop correctly', async () => {
      const events = [
        {
          event: 'message_start',
          data: {
            type: 'message_start',
            message: {
              id: 'msg_123',
              role: 'assistant',
              content: [],
              model: 'test',
              usage: { input_tokens: 10, output_tokens: 0 },
            },
          },
        },
        {
          event: 'message_stop',
          data: { type: 'message_stop' },
        },
      ];

      const results = await processSSEStream(events);

      expect(results[0]).toEqual(events[0]);
      expect(results[results.length - 1]).toEqual(events[1]);
    });

    it('should handle message_delta correctly', async () => {
      const events = [
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 10 },
          },
        },
      ];

      const results = await processSSEStream(events);

      expect(results).toEqual(events);
    });
  });

  describe('Full SSE Round-Trip', () => {
    it('should survive serialization and parsing', async () => {
      const events = [
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Normal text' },
          },
        },
        {
          event: 'content_block_stop',
          data: { type: 'content_block_stop', index: 0 },
        },
      ];

      const results = await roundTripThroughSSE(events);

      // Should successfully round-trip
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].event).toBe('content_block_start');
    });
  });
});
