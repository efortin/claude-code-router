import { XMLToolCallParser } from './XMLToolCallParser';

/**
 * Transform stream that detects XML-style tool calls in SSE events
 * and converts them to proper Anthropic API format
 * 
 * Preserves:
 * - Streaming order
 * - Content indices
 * - Token counting accuracy
 * - Event sequencing
 */
export class XMLToolCallTransformStream extends TransformStream<any, any> {
  constructor() {
    const parser = new XMLToolCallParser();
    let currentIndex = 0;
    let textBlockActive = false;
    let textBuffer = '';

    super({
      transform: (event, controller) => {
        // Only log if XML is detected
        if (event.data) {
          const fullData = JSON.stringify(event.data);
          if (fullData.includes('<function=') || fullData.includes('<parameter=') || fullData.includes('<tool_call>')) {
            console.error('[XMLToolCallTransform] ⚠️ XML FOUND IN EVENT!');
            console.error('[XMLToolCallTransform] Event:', JSON.stringify(event).substring(0, 500));
          }
        }
        
        // Pass through non-content events unchanged
        if (!event.event || !event.data) {
          controller.enqueue(event);
          return;
        }

        // Track content_block_start for text
        if (event.event === 'content_block_start') {
          if (event.data?.content_block?.type === 'text') {
            textBlockActive = true;
            currentIndex = event.data.index || 0;
          }
          controller.enqueue(event);
          return;
        }

        // Track content_block_stop
        if (event.event === 'content_block_stop') {
          if (textBlockActive && textBuffer) {
            // Process any buffered text before stopping
            const result = parser.processChunk('');
            if (result.toolCalls.length > 0) {
              // Emit buffered tool calls
              this.emitToolCalls(result.toolCalls, controller, currentIndex);
              currentIndex += result.toolCalls.length;
            }
            textBuffer = '';
          }
          textBlockActive = false;
          controller.enqueue(event);
          return;
        }

        // Handle text deltas - this is where we detect XML tool calls
        if (
          event.event === 'content_block_delta' &&
          event.data?.delta?.type === 'text_delta' &&
          textBlockActive
        ) {
          const text = event.data.delta.text || '';
          textBuffer += text;

          // Check if we should try to parse tool calls
          if (XMLToolCallParser.containsToolCallXML(textBuffer)) {
            console.error('[XMLToolCallTransform] ========== XML DETECTED ==========');
            console.error('[XMLToolCallTransform] Buffer length:', textBuffer.length);
            console.error('[XMLToolCallTransform] Preview:', textBuffer.substring(0, 200));
            const result = parser.processChunk(textBuffer);
            console.error('[XMLToolCallTransform] Parser result:', {
              toolCallsFound: result.toolCalls.length,
              cleanedTextLength: result.cleanedText.length,
              toolNames: result.toolCalls.map(t => t.name),
              toolCallsJSON: JSON.stringify(result.toolCalls, null, 2).substring(0, 300)
            });
            console.error('[XMLToolCallTransform] ===============================');

            // If we found complete tool calls
            if (result.toolCalls.length > 0) {
              console.log('[XMLToolCallTransform] Detected and transforming', result.toolCalls.length, 'XML tool call(s)');
              console.log('[XMLToolCallTransform] Tool names:', result.toolCalls.map(t => t.name).join(', '));
              // 1. Send cleaned text if any
              if (result.cleanedText) {
                controller.enqueue({
                  event: 'content_block_delta',
                  data: {
                    type: 'content_block_delta',
                    index: currentIndex,
                    delta: {
                      type: 'text_delta',
                      text: result.cleanedText,
                    },
                  },
                });
              }

              // 2. Stop current text block
              controller.enqueue({
                event: 'content_block_stop',
                data: {
                  type: 'content_block_stop',
                  index: currentIndex,
                },
              });

              textBlockActive = false;
              currentIndex++;

              // 3. Emit tool calls
              this.emitToolCalls(result.toolCalls, controller, currentIndex);
              currentIndex += result.toolCalls.length;

              // 4. Start new text block for any remaining content
              if (textBuffer !== result.cleanedText) {
                textBlockActive = true;
                controller.enqueue({
                  event: 'content_block_start',
                  data: {
                    type: 'content_block_start',
                    index: currentIndex,
                    content_block: {
                      type: 'text',
                      text: '',
                    },
                  },
                });
              }

              textBuffer = '';
              return;
            }
          }

          // No tool calls found yet, pass through
          controller.enqueue(event);
          return;
        }

        // Handle tool_use deltas (already in correct format)
        if (
          event.event === 'content_block_delta' &&
          event.data?.delta?.type === 'input_json_delta'
        ) {
          controller.enqueue(event);
          return;
        }

        // Handle tool_use blocks that are already correct
        if (
          event.event === 'content_block_start' &&
          event.data?.content_block?.type === 'tool_use'
        ) {
          currentIndex = event.data.index || currentIndex;
          controller.enqueue(event);
          return;
        }

        // Pass through everything else
        controller.enqueue(event);
      },

      flush: (controller) => {
        // Process any remaining buffered content
        const result = parser.flush();

        if (result.toolCalls.length > 0) {
          // Stop current text block if active
          if (textBlockActive) {
            controller.enqueue({
              event: 'content_block_stop',
              data: {
                type: 'content_block_stop',
                index: currentIndex,
              },
            });
            currentIndex++;
          }

          // Emit remaining tool calls
          this.emitToolCalls(result.toolCalls, controller, currentIndex);
        } else if (result.cleanedText && textBlockActive) {
          // Emit remaining text
          controller.enqueue({
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: currentIndex,
              delta: {
                type: 'text_delta',
                text: result.cleanedText,
              },
            },
          });
        }
      },
    });
  }

  /**
   * Emit tool calls as proper SSE events
   */
  private emitToolCalls(toolCalls: any[], controller: any, startIndex: number): void {
    toolCalls.forEach((toolCall, i) => {
      const index = startIndex + i;

      // Validate tool call before emitting
      if (!toolCall.name || typeof toolCall.name !== 'string') {
        console.warn('[XMLToolCallTransform] Invalid tool call - missing or invalid name:', toolCall);
        return;
      }

      // Ensure input is a valid object
      let safeInput = toolCall.input;
      if (!safeInput || typeof safeInput !== 'object' || Array.isArray(safeInput)) {
        console.warn('[XMLToolCallTransform] Invalid tool input, using empty object:', safeInput);
        safeInput = {};
      }

      // Validate JSON serialization
      let jsonInput: string;
      try {
        jsonInput = JSON.stringify(safeInput);
        // Verify it can be parsed back
        JSON.parse(jsonInput);
        console.error('[XMLToolCallTransform] ✅ Valid JSON for tool', toolCall.name, ':', jsonInput.substring(0, 100));
      } catch (e) {
        console.error('[XMLToolCallTransform] ❌ Failed to serialize tool input:', e, safeInput);
        jsonInput = '{}';
      }

      // Start tool use block
      controller.enqueue({
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index,
          content_block: {
            type: 'tool_use',
            id: toolCall.id || `toolu_xml_${Date.now()}_${i}`,
            name: toolCall.name,
            input: {},
          },
        },
      });

      // Send tool input as delta
      controller.enqueue({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index,
          delta: {
            type: 'input_json_delta',
            partial_json: jsonInput,
          },
        },
      });

      // Stop tool use block
      controller.enqueue({
        event: 'content_block_stop',
        data: {
          type: 'content_block_stop',
          index,
        },
      });
    });
  }
}
