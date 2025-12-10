import {
  transformToOpenAIVisionFormat,
  transformOpenAIToAnthropicResponse,
} from '../../src/utils/vision';

describe('transformToOpenAIVisionFormat', () => {
  it('should transform Claude image format to OpenAI image_url format', () => {
    const input = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64encodedstring',
              },
            },
          ],
        },
      ],
    };

    const result = transformToOpenAIVisionFormat(input);
    // Check image transformation works
    expect(result.messages[0].content[0]).toEqual({ type: 'text', text: 'What is this?' });
    expect(result.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,base64encodedstring' },
    });
    // Should only have 2 items
    expect(result.messages[0].content).toHaveLength(2);
    // enable_thinking should NOT be present (removed)
    expect(result.chat_template_kwargs).toBeUndefined();
  });

  it('should handle missing media_type default to image/jpeg', () => {
    const input = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                data: 'base64encodedstring',
              },
            },
          ],
        },
      ],
    };

    const result = transformToOpenAIVisionFormat(input);
    expect(result.messages[0].content[0].image_url.url).toContain(
      'data:image/jpeg;base64,base64encodedstring'
    );
  });

  it('should handle item.source as direct data string (legacy/edge case)', () => {
    const input = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: 'base64encodedstring',
            },
          ],
        },
      ],
    };

    const result = transformToOpenAIVisionFormat(input);
    expect(result.messages[0].content[0].image_url.url).toBe(
      'data:image/jpeg;base64,base64encodedstring'
    );
  });

  it('should leave text messages unchanged', () => {
    const input = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    };
    const result = transformToOpenAIVisionFormat(input);
    // Original text should be preserved (no reasoning instruction)
    expect(result.messages[0].content[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(result.messages[0].content).toHaveLength(1);
  });

  it('should handle messages without content array', () => {
    const input = {
      messages: [{ role: 'user', content: 'Simple string content' }],
    };
    const result = transformToOpenAIVisionFormat(input);
    // Messages should be preserved
    expect(result.messages).toEqual(input.messages);
    // enable_thinking should NOT be present
    expect(result.chat_template_kwargs).toBeUndefined();
  });

  it('should convert tool_use to text placeholder', () => {
    const input = {
      messages: [
        { role: 'user', content: [{ type: 'tool_use', name: 'grep', id: '1', input: {} }] },
      ],
    };
    const result = transformToOpenAIVisionFormat(input);
    expect(result.messages[0].content[0]).toEqual({ type: 'text', text: '[Tool Use: grep]' });
  });

  it('should convert tool_result to text placeholder', () => {
    const input = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: '1', content: 'output' }],
        },
      ],
    };
    const result = transformToOpenAIVisionFormat(input);
    expect(result.messages[0].content[0]).toEqual({ type: 'text', text: '[Tool Result]' });
  });
});

describe('transformOpenAIToAnthropicResponse', () => {
  it('should transform OpenAI choice to Anthropic content', () => {
    const openAIResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1677652288,
      model: 'gpt-4-vision-preview',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I see a cat.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };

    const result = transformOpenAIToAnthropicResponse(openAIResponse);

    expect(result.id).toBe('chatcmpl-123');
    expect(result.type).toBe('message');
    expect(result.role).toBe('assistant');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'I see a cat.' });
    expect(result.model).toBe('gpt-4-vision-preview');
    expect(result.stop_reason).toBe('end_turn');
    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it('should handle missing choices or content gracefully', () => {
    const openAIResponse = {
      id: 'chatcmpl-empty',
      model: 'test-model',
      choices: [],
    };

    const result = transformOpenAIToAnthropicResponse(openAIResponse);
    expect(result.content[0].text).toBe('');
  });

  it('should pass through think tags content (no stripping)', () => {
    const openAIResponse = {
      id: 'chatcmpl-reasoning',
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '<think>I am thinking.</think>\nI see a cat.',
          },
          finish_reason: 'stop',
        },
      ],
    };

    const result = transformOpenAIToAnthropicResponse(openAIResponse);
    expect(result.content).toHaveLength(1);
    // Think tags should be present
    expect(result.content[0].text).toContain('<think>');
    expect(result.content[0].text).toContain('I see a cat.');
  });

  it('should handle content without reasoning tags', () => {
    const openAIResponse = {
      id: 'chatcmpl-no-reasoning',
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'I see a cat.',
          },
          finish_reason: 'stop',
        },
      ],
    };

    const result = transformOpenAIToAnthropicResponse(openAIResponse);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'I see a cat.' });
  });
});
