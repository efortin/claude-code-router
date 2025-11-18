export class SSESerializerTransform extends TransformStream<any, string> {
  constructor() {
    super({
      transform: (event, controller) => {
        let output = '';

        if (event.event) {
          output += `event: ${event.event}\n`;
        }
        if (event.id) {
          output += `id: ${event.id}\n`;
        }
        if (event.retry) {
          output += `retry: ${event.retry}\n`;
        }
        if (event.data) {
          if (event.data.type === 'done') {
            output += 'data: [DONE]\n';
          } else {
            try {
              const jsonData = JSON.stringify(event.data);
              // Verify it can be parsed back
              JSON.parse(jsonData);
              output += `data: ${jsonData}\n`;
            } catch (e) {
              console.error('[SSESerializer] Failed to serialize event data:', {
                error: e instanceof Error ? e.message : String(e),
                eventType: event.event,
                dataType: event.data?.type,
                dataKeys: event.data ? Object.keys(event.data) : []
              });
              // Send minimal valid event to avoid breaking the stream
              output += `data: ${JSON.stringify({ type: 'error', error: 'serialization_failed' })}\n`;
            }
          }
        }

        output += '\n';
        controller.enqueue(output);
      },
    });
  }
}
