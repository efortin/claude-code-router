import { webSearchAgent } from '../../src/agents/websearch.agent';

// Mock @agentic/searxng
jest.mock('@agentic/searxng', () => ({
  SearxngClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      results: [
        {
          title: 'Test Result 1',
          url: 'https://example.com/1',
          content: 'This is a test search result.',
        },
        {
          title: 'Test Result 2',
          url: 'https://example.com/2',
          content: 'Another search result content.',
        },
      ],
    }),
  })),
}));

// Mock config
const mockConfig = {
  websearch_api: 'http://mock-searxng:8080',
};

describe('Web Search Agent', () => {
  describe('shouldHandle', () => {
    it('should return true when websearch_api is configured', () => {
      const req = { body: {} };
      expect(webSearchAgent.shouldHandle(req, mockConfig)).toBe(true);
    });

    it('should return false when websearch_api is not configured', () => {
      const req = { body: {} };
      expect(webSearchAgent.shouldHandle(req, {})).toBe(false);
    });
  });

  describe('reqHandler', () => {
    it('should inject system prompt for web search guidance', () => {
      const req = { body: { system: [] } };
      webSearchAgent.reqHandler(req, mockConfig);
      expect(req.body.system).toHaveLength(1);
      expect(req.body.system[0].text).toContain('web_search');
    });

    it('should create system array if not present', () => {
      const req: any = { body: {} };
      webSearchAgent.reqHandler(req, mockConfig);
      expect(req.body.system).toBeDefined();
      expect(req.body.system).toHaveLength(1);
    });
  });

  describe('web_search tool handler', () => {
    const toolHandler = webSearchAgent.tools.get('web_search')?.handler;

    it('should execute search and return formatted results', async () => {
      const mockReq = { log: { info: jest.fn(), error: jest.fn() } };
      const result = await toolHandler?.(
        { query: 'test search query' },
        { config: mockConfig, req: mockReq }
      );

      expect(result).toContain('Web Search Results for "test search query"');
      expect(result).toContain('Test Result 1');
      expect(result).toContain('https://example.com/1');
    });

    it('should respect maxResults parameter', async () => {
      const mockReq = { log: { info: jest.fn(), error: jest.fn() } };
      const result = await toolHandler?.(
        { query: 'test query', maxResults: 1 },
        { config: mockConfig, req: mockReq }
      );

      expect(result).toContain('showing 1');
    });

    it('should return error message when websearch_api is not configured', async () => {
      const mockReq = { log: { info: jest.fn(), error: jest.fn() } };
      const result = await toolHandler?.({ query: 'test query' }, { config: {}, req: mockReq });

      expect(result).toContain('Web search is not configured');
    });
  });

  describe('tool definition', () => {
    it('should have correct tool name and schema', () => {
      const tool = webSearchAgent.tools.get('web_search');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('web_search');
      expect(tool?.input_schema.properties.query).toBeDefined();
      expect(tool?.input_schema.required).toContain('query');
    });
  });
});
