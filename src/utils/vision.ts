export const transformToOpenAIVisionFormat = (body: any) => {
  const visionRequestBody = { ...body };

  // Disable Qwen's thinking mode to hide CoT reasoning
  visionRequestBody.chat_template_kwargs = {
    ...(visionRequestBody.chat_template_kwargs || {}),
    enable_thinking: false,
  };

  if (visionRequestBody.messages) {
    visionRequestBody.messages = visionRequestBody.messages.map((msg: any) => {
      if (msg.content && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((item: any) => {
            // Convert Claude image format to OpenAI format
            if (item.type === 'image' && item.source) {
              const imageData = item.source.data || item.source;
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${item.source.media_type || 'image/jpeg'};base64,${imageData}`,
                },
              };
            }
            // Convert tool types to text placeholders to avoid validation errors
            if (item.type === 'tool_use') {
              return { type: 'text', text: `[Tool Use: ${item.name}]` };
            }
            if (item.type === 'tool_result') {
              return { type: 'text', text: `[Tool Result]` };
            }
            return item;
          }),
        };
      }
      return msg;
    });
  }
  return visionRequestBody;
};

export const transformOpenAIToAnthropicResponse = (openAIResponse: any) => {
  let content = openAIResponse.choices?.[0]?.message?.content || '';

  // Strip Qwen's native <think>...</think> tags and any <reasoning_content> tags
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  content = content.replace(/<reasoning_content>[\s\S]*?<\/reasoning_content>/g, '').trim();

  return {
    id: openAIResponse.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: openAIResponse.model,
    stop_reason: openAIResponse.choices?.[0]?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
    stop_sequence: null,
    usage: {
      input_tokens: openAIResponse.usage?.prompt_tokens || 0,
      output_tokens: openAIResponse.usage?.completion_tokens || 0,
    },
  };
};
