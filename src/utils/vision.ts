export const transformToOpenAIVisionFormat = (body: any) => {
  const visionRequestBody = { ...body };

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
            return item;
          }),
        };
      }
      return msg;
    });
  }
  return visionRequestBody;
};
