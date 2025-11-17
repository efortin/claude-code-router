import { SSEParserTransform } from '../../src/utils/SSEParser.transform';

describe.skip('SSEParserTransform', () => {
  it('should parse simple SSE events', async () => {
    const parser = new SSEParserTransform();
    const writer = parser.writable.getWriter();
    const reader = parser.readable.getReader();

    const encoder = new TextEncoder();

    // Write SSE data
    await writer.write(encoder.encode('event: message\n'));
    await writer.write(encoder.encode('data: {"text":"hello"}\n'));
    await writer.write(encoder.encode('\n'));
    await writer.close();

    // Read parsed event
    const { value, done } = await reader.read();

    expect(done).toBe(false);
    expect(value).toEqual({
      event: 'message',
      data: { text: 'hello' },
    });
  });

  it('should handle multi-line data', async () => {
    const parser = new SSEParserTransform();
    const writer = parser.writable.getWriter();
    const reader = parser.readable.getReader();

    const encoder = new TextEncoder();

    await writer.write(encoder.encode('event: test\ndata: {"key":"value"}\n\n'));
    await writer.close();

    const { value } = await reader.read();

    expect(value.event).toBe('test');
    expect(value.data).toEqual({ key: 'value' });
  });

  it('should handle [DONE] message', async () => {
    const parser = new SSEParserTransform();
    const writer = parser.writable.getWriter();
    const reader = parser.readable.getReader();

    const encoder = new TextEncoder();

    await writer.write(encoder.encode('data: [DONE]\n\n'));
    await writer.close();

    const { value } = await reader.read();

    expect(value.data).toEqual({ type: 'done' });
  });

  it('should handle invalid JSON gracefully', async () => {
    const parser = new SSEParserTransform();
    const writer = parser.writable.getWriter();
    const reader = parser.readable.getReader();

    const encoder = new TextEncoder();

    await writer.write(encoder.encode('data: invalid json\n\n'));
    await writer.close();

    const { value } = await reader.read();

    expect(value.data).toHaveProperty('error', 'JSON parse failed');
    expect(value.data).toHaveProperty('raw', 'invalid json');
  });

  it('should parse id and retry fields', async () => {
    const parser = new SSEParserTransform();
    const writer = parser.writable.getWriter();
    const reader = parser.readable.getReader();

    const encoder = new TextEncoder();

    await writer.write(encoder.encode('id: 123\n'));
    await writer.write(encoder.encode('retry: 5000\n'));
    await writer.write(encoder.encode('data: {"msg":"test"}\n\n'));
    await writer.close();

    const { value } = await reader.read();

    expect(value.id).toBe('123');
    expect(value.retry).toBe(5000);
    expect(value.data).toEqual({ msg: 'test' });
  });

  it('should handle incomplete chunks', async () => {
    const parser = new SSEParserTransform();
    const writer = parser.writable.getWriter();
    const reader = parser.readable.getReader();

    const encoder = new TextEncoder();

    // Send incomplete event
    await writer.write(encoder.encode('event: test\ndata: {"part'));
    await writer.write(encoder.encode('ial":"data"}\n\n'));
    await writer.close();

    const { value } = await reader.read();

    expect(value.event).toBe('test');
    expect(value.data).toEqual({ partial: 'data' });
  });
});
