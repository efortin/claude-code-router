import { ImageAgent } from '../../src/agents/image.agent';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('ImageAgent', () => {
  let imageAgent: ImageAgent;

  beforeEach(() => {
    imageAgent = new ImageAgent();
    mockFetch.mockReset();
  });

  describe('analyzeImage tool', () => {
    const createMockContext = (authHeader?: { key: string; value: string }) => {
      const headers: Record<string, string> = {};
      if (authHeader) {
        headers[authHeader.key] = authHeader.value;
      }
      return {
        req: {
          id: 'test-request-id',
          headers,
          body: {
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Analyze this image' }],
              },
            ],
          },
        },
        config: {
          PORT: 3456,
          Router: { image: 'test-image-model' },
        },
      };
    };

    const setupMockFetchResponse = () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            content: [{ text: 'Image analysis result' }],
          }),
      });
    };

    it('should forward lowercase authorization header', async () => {
      setupMockFetchResponse();
      const context = createMockContext({
        key: 'authorization',
        value: 'Bearer test-jwt-token-lowercase',
      });

      const tool = imageAgent.tools.get('analyzeImage');
      expect(tool).toBeDefined();

      await tool!.handler({ imageId: ['1'], task: 'analyze' }, context);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const fetchOptions = fetchCall[1];

      expect(fetchOptions.headers).toHaveProperty('authorization');
      expect(fetchOptions.headers.authorization).toBe('Bearer test-jwt-token-lowercase');
    });

    it('should forward capitalized Authorization header', async () => {
      setupMockFetchResponse();
      const context = createMockContext({
        key: 'Authorization',
        value: 'Bearer test-jwt-token-capitalized',
      });

      const tool = imageAgent.tools.get('analyzeImage');
      expect(tool).toBeDefined();

      await tool!.handler({ imageId: ['1'], task: 'analyze' }, context);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const fetchOptions = fetchCall[1];

      expect(fetchOptions.headers).toHaveProperty('authorization');
      expect(fetchOptions.headers.authorization).toBe('Bearer test-jwt-token-capitalized');
    });

    it('should not include authorization header when not provided', async () => {
      setupMockFetchResponse();
      const context = createMockContext(); // No auth header

      const tool = imageAgent.tools.get('analyzeImage');
      expect(tool).toBeDefined();

      await tool!.handler({ imageId: ['1'], task: 'analyze' }, context);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const fetchOptions = fetchCall[1];

      expect(fetchOptions.headers).not.toHaveProperty('authorization');
      expect(fetchOptions.headers).toHaveProperty('content-type', 'application/json');
    });

    it('should prefer lowercase authorization over capitalized when both present', async () => {
      setupMockFetchResponse();
      const context = createMockContext();
      // Add both headers
      context.req.headers['authorization'] = 'Bearer lowercase-token';
      context.req.headers['Authorization'] = 'Bearer capitalized-token';

      const tool = imageAgent.tools.get('analyzeImage');
      await tool!.handler({ imageId: ['1'], task: 'analyze' }, context);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const fetchOptions = fetchCall[1];

      // Should prefer lowercase (as per || operator short-circuit)
      expect(fetchOptions.headers.authorization).toBe('Bearer lowercase-token');
    });
  });

  describe('shouldHandle', () => {
    it('should return false when no image router configured', () => {
      const req = {
        body: {
          messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        },
      };
      const config = { Router: {} };

      expect(imageAgent.shouldHandle(req, config)).toBe(false);
    });
  });

  describe('reqHandler', () => {
    it('should inject system prompt for image analysis', () => {
      const req = {
        body: {
          system: [],
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'hello' }],
            },
          ],
        },
      };
      const config = {};

      imageAgent.reqHandler(req, config);

      expect(req.body.system.length).toBe(1);
      expect(req.body.system[0].type).toBe('text');
      expect(req.body.system[0].text).toContain('analyzeImage');
    });
  });
});
