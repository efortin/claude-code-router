import { WebSearchAgent, webSearchAgent } from '../../src/agents/websearch.agent';
import { IAgent } from '../../src/agents/type';

// Create a mock search function that we can spy on
const mockSearch = jest.fn();

// Mock @agentic/searxng
jest.mock('@agentic/searxng', () => ({
  SearxngClient: jest.fn().mockImplementation(() => ({
    search: mockSearch,
  })),
}));

import { SearxngClient } from '@agentic/searxng';

describe('WebSearchAgent', () => {
  let agent: WebSearchAgent;

  beforeEach(() => {
    agent = new WebSearchAgent();
    jest.clearAllMocks();
  });

  describe('Agent Properties', () => {
    it('should have correct name', () => {
      expect(agent.name).toBe('websearch');
    });

    it('should have tools map initialized', () => {
      expect(agent.tools).toBeInstanceOf(Map);
      expect(agent.tools.size).toBeGreaterThan(0);
    });

    it('should export webSearchAgent instance', () => {
      expect(webSearchAgent).toBeInstanceOf(WebSearchAgent);
    });
  });

  describe('shouldHandle', () => {
    it('should return true when websearch_api is configured', () => {
      const config = {
        websearch_api: 'http://localhost:8080',
      };
      const req = {};

      const result = agent.shouldHandle(req, config);

      expect(result).toBe(true);
    });

    it('should return false when websearch_api is not configured', () => {
      const config = {};
      const req = {};

      const result = agent.shouldHandle(req, config);

      expect(result).toBe(false);
    });

    it('should return false when websearch_api is empty string', () => {
      const config = {
        websearch_api: '',
      };
      const req = {};

      const result = agent.shouldHandle(req, config);

      expect(result).toBe(false);
    });
  });

  describe('Tools', () => {
    it('should register webSearch tool', () => {
      expect(agent.tools.has('webSearch')).toBe(true);
    });

    it('should have correct tool name', () => {
      const tool = agent.tools.get('webSearch');
      expect(tool?.name).toBe('webSearch');
    });

    it('should have description', () => {
      const tool = agent.tools.get('webSearch');
      expect(tool?.description).toBeDefined();
      expect(typeof tool?.description).toBe('string');
      expect(tool?.description.length).toBeGreaterThan(0);
    });

    it('should have correct input schema', () => {
      const tool = agent.tools.get('webSearch');
      expect(tool?.input_schema).toBeDefined();
      expect(tool?.input_schema.type).toBe('object');
      expect(tool?.input_schema.properties).toBeDefined();
      expect(tool?.input_schema.properties.query).toBeDefined();
      expect(tool?.input_schema.required).toContain('query');
    });

    it('should have optional categories parameter', () => {
      const tool = agent.tools.get('webSearch');
      expect(tool?.input_schema.properties.categories).toBeDefined();
      expect(tool?.input_schema.properties.categories.type).toBe('array');
    });

    it('should have optional maxResults parameter', () => {
      const tool = agent.tools.get('webSearch');
      expect(tool?.input_schema.properties.maxResults).toBeDefined();
      expect(tool?.input_schema.properties.maxResults.type).toBe('number');
    });
  });

  describe('Tool Handler', () => {
    let tool: any;
    let mockContext: any;

    beforeEach(() => {
      tool = agent.tools.get('webSearch');
      mockContext = {
        config: {
          websearch_api: 'http://localhost:8080',
        },
        req: {
          log: {
            error: jest.fn(),
          },
        },
      };
    });

    it('should execute search with query', async () => {
      const mockResults = {
        results: [
          {
            title: 'Test Result 1',
            url: 'https://example.com/1',
            content: 'This is test result 1',
          },
          {
            title: 'Test Result 2',
            url: 'https://example.com/2',
            content: 'This is test result 2',
          },
        ],
      };

      mockSearch.mockResolvedValue(mockResults);

      const args = {
        query: 'test query',
      };

      const result = await tool?.handler(args, mockContext);

      expect(mockSearch).toHaveBeenCalledWith({
        q: 'test query',
      });
      expect(result).toContain('Found 2 results');
      expect(result).toContain('Test Result 1');
      expect(result).toContain('https://example.com/1');
    });

    it('should handle categories parameter', async () => {
      const mockResults = {
        results: [
          {
            title: 'News Result',
            url: 'https://news.example.com',
            content: 'Breaking news',
          },
        ],
      };

      mockSearch.mockResolvedValue(mockResults);

      const args = {
        query: 'latest news',
        categories: ['news', 'general'],
      };

      const result = await tool?.handler(args, mockContext);

      expect(mockSearch).toHaveBeenCalledWith({
        q: 'latest news',
        categories: 'news,general',
      });
      expect(result).toBeDefined();
    });

    it('should limit results based on maxResults', async () => {
      const mockResults = {
        results: Array.from({ length: 20 }, (_, i) => ({
          title: `Result ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          content: `Content ${i + 1}`,
        })),
      };

      mockSearch.mockResolvedValue(mockResults);

      const args = {
        query: 'test query',
        maxResults: 3,
      };

      const result = await tool?.handler(args, mockContext);

      expect(result).toContain('showing 3');
      expect(result).toContain('Result 1');
      expect(result).toContain('Result 3');
      expect(result).not.toContain('Result 4');
    });

    it('should enforce max limit of 10 results', async () => {
      const mockResults = {
        results: Array.from({ length: 20 }, (_, i) => ({
          title: `Result ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          content: `Content ${i + 1}`,
        })),
      };

      mockSearch.mockResolvedValue(mockResults);

      const args = {
        query: 'test query',
        maxResults: 100,
      };

      const result = await tool?.handler(args, mockContext);

      expect(result).toContain('showing 10');
    });

    it('should handle no results', async () => {
      mockSearch.mockResolvedValue({
        results: [],
      });

      const args = {
        query: 'nonexistent query',
      };

      const result = await tool?.handler(args, mockContext);

      expect(result).toBe('No results found for the query.');
    });

    it('should handle missing result fields gracefully', async () => {
      const mockResults = {
        results: [
          {
            // Missing title, url, and content
          },
          {
            title: 'Title Only',
            // Missing url and content
          },
        ],
      };

      mockSearch.mockResolvedValue(mockResults);

      const args = {
        query: 'test query',
      };

      const result = await tool?.handler(args, mockContext);

      expect(result).toContain('Untitled');
      expect(result).toContain('No description available');
    });

    it('should handle search errors', async () => {
      mockSearch.mockRejectedValue(new Error('Network error'));

      const args = {
        query: 'test query',
      };

      const result = await tool?.handler(args, mockContext);

      expect(result).toContain('Error performing web search');
      expect(result).toContain('Network error');
      expect(mockContext.req.log.error).toHaveBeenCalled();
    });

    it('should use default endpoint when not configured', async () => {
      const contextWithoutEndpoint = {
        config: {},
        req: {
          log: {
            error: jest.fn(),
          },
        },
      };

      mockSearch.mockResolvedValue({ results: [] });

      const args = {
        query: 'test query',
      };

      await tool?.handler(args, contextWithoutEndpoint);

      // Client should be initialized with default endpoint
      expect(SearxngClient).toHaveBeenCalledWith({
        apiBaseUrl: 'http://localhost:8080',
      });
    });
  });

  describe('reqHandler', () => {
    it('should inject system prompt when system array exists', () => {
      const req: any = {
        body: {
          system: [],
        },
      };

      agent.reqHandler(req, {});

      expect(req.body.system.length).toBe(1);
      expect(req.body.system[0].type).toBe('text');
      expect(req.body.system[0].text).toContain('web search tool');
      expect(req.body.system[0].text).toContain('webSearch');
    });

    it('should create system array if it does not exist', () => {
      const req: any = {
        body: {},
      };

      agent.reqHandler(req, {});

      expect(req.body.system).toBeDefined();
      expect(Array.isArray(req.body.system)).toBe(true);
      expect(req.body.system.length).toBe(1);
    });

    it('should include usage instructions in system prompt', () => {
      const req: any = {
        body: {
          system: [],
        },
      };

      agent.reqHandler(req, {});

      const systemPrompt = req.body.system[0].text;
      expect(systemPrompt).toContain('Recent events');
      expect(systemPrompt).toContain('Up-to-date');
      expect(systemPrompt).toContain('cite the sources');
    });
  });
});
