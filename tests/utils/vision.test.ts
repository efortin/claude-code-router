
import { transformToOpenAIVisionFormat } from '../../src/utils/vision';

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

        const expected = {
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is this?' },
                        {
                            type: 'image_url',
                            image_url: {
                                url: 'data:image/jpeg;base64,base64encodedstring',
                            },
                        },
                    ],
                },
            ],
        };

        const result = transformToOpenAIVisionFormat(input);
        expect(result).toEqual(expected);
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
        expect(result.messages[0].content[0].image_url.url).toContain('data:image/jpeg;base64,base64encodedstring');
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
        // Note: The implementation uses item.source.data || item.source.
        // If item.source is a string, item.source.data is undefined, so it takes item.source.
        // item.source.media_type will be undefined, so defaults to image/jpeg.
        expect(result.messages[0].content[0].image_url.url).toBe('data:image/jpeg;base64,base64encodedstring');
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
        expect(transformToOpenAIVisionFormat(input)).toEqual(input);
    });

    it('should handle messages without content array', () => {
        const input = {
            messages: [{ role: 'user', content: 'Simple string content' }]
        };
        expect(transformToOpenAIVisionFormat(input)).toEqual(input);
    });
});
