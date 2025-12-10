export const transformToOpenAIVisionFormat = (body: any) => {
  const visionRequestBody = { ...body };

  // Instruction to force model to use reasoning tags (matching llms forcereasoning behavior)
  const REASONING_INSTRUCTION = `Always think before answering. Even if the problem seems simple, always write down your reasoning process explicitly.

Output format:
<reasoning_content>
Your detailed thinking process goes here
</reasoning_content>
Your final answer must follow after the closing tag above.`;

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

    // Inject reasoning instruction to last user message (matching llms forcereasoning)
    const lastMessage = visionRequestBody.messages[visionRequestBody.messages.length - 1];
    if (lastMessage?.role === 'user') {
      if (Array.isArray(lastMessage.content)) {
        lastMessage.content.push({ type: 'text', text: REASONING_INSTRUCTION });
      } else if (typeof lastMessage.content === 'string') {
        lastMessage.content = [
          { type: 'text', text: lastMessage.content },
          { type: 'text', text: REASONING_INSTRUCTION },
        ];
      }
    }
  }
  return visionRequestBody;
};

export const transformOpenAIToAnthropicResponse = (openAIResponse: any) => {
  let content = openAIResponse.choices?.[0]?.message?.content || '';

  // Extract and STRIP reasoning from tags (matching llms behavior but hiding it)
  const reasoningRegex = /<reasoning_content>([\s\S]*?)<\/reasoning_content>/;
  content = content.replace(reasoningRegex, '').trim();

  // Build content array with just text (no thinking block - reasoning is hidden)
  const contentArray: any[] = [];
  contentArray.push({
    type: 'text',
    text: content,
  });

  return {
    id: openAIResponse.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: contentArray,
    model: openAIResponse.model,
    stop_reason: openAIResponse.choices?.[0]?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
    stop_sequence: null,
    usage: {
      input_tokens: openAIResponse.usage?.prompt_tokens || 0,
      output_tokens: openAIResponse.usage?.completion_tokens || 0,
    },
  };
};
