export class SSEParserTransform extends TransformStream<Uint8Array, any> {
  constructor() {
    let buffer = '';
    let currentEvent: Record<string, any> = {};

    const processLine = (line: string, events?: any[]): any | null => {
      if (!line.trim()) {
        if (Object.keys(currentEvent).length > 0) {
          const event = { ...currentEvent };
          currentEvent = {};
          if (events) {
            events.push(event);
            return null;
          }
          return event;
        }
        return null;
      }

      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          currentEvent.data = { type: 'done' };
        } else {
          try {
            currentEvent.data = JSON.parse(data);
          } catch (e) {
            console.error('[SSEParser] Failed to parse JSON data:', {
              error: e instanceof Error ? e.message : String(e),
              data: data.substring(0, 200), // First 200 chars
              dataLength: data.length
            });
            currentEvent.data = { raw: data, error: 'JSON parse failed' };
          }
        }
      } else if (line.startsWith('id:')) {
        currentEvent.id = line.slice(3).trim();
      } else if (line.startsWith('retry:')) {
        currentEvent.retry = parseInt(line.slice(6).trim());
      }
      return null;
    };

    super({
      transform: (chunk: Uint8Array, controller) => {
        const decoder = new TextDecoder();
        const text = decoder.decode(chunk);
        buffer += text;
        const lines = buffer.split('\n');

        // Keep last line (may be incomplete)
        buffer = lines.pop() || '';

        for (const line of lines) {
          const event = processLine(line);
          if (event) {
            controller.enqueue(event);
          }
        }
      },
      flush: (controller) => {
        // Process remaining content in buffer
        if (buffer.trim()) {
          const events: any[] = [];
          processLine(buffer.trim(), events);
          events.forEach((event) => controller.enqueue(event));
        }

        // Push last event (if any)
        if (Object.keys(currentEvent).length > 0) {
          controller.enqueue(currentEvent);
        }
      },
    });
  }
}
