import { SearchAgent } from '../../src/agents/search.agent';
import { search } from 'duck-duck-scrape';

describe('SearchAgent', () => {
  let searchAgent: SearchAgent;
  const mockedSearch = search as jest.MockedFunction<typeof search>;

  beforeEach(() => {
    searchAgent = new SearchAgent();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should have correct name', () => {
      expect(searchAgent.name).toBe('search');
    });

    it('should register search_web tool', () => {
      const tool = searchAgent.tools.get('search_web');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('search_web');
    });

    it('should have correct tool schema', () => {
      const tool = searchAgent.tools.get('search_web');
      expect(tool?.input_schema).toEqual({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute',
          },
          domain: {
            type: 'string',
            description: 'Optional domain to filter results',
          },
        },
        required: ['query'],
      });
    });
  });

  describe('shouldHandle', () => {
    it('should always return true', () => {
      expect(searchAgent.shouldHandle({}, {})).toBe(true);
    });
  });

  describe('reqHandler', () => {
    it('should be a no-op', () => {
      expect(() => searchAgent.reqHandler({}, {})).not.toThrow();
    });
  });

  describe('search_web tool handler', () => {
    it('should return error when query is missing', async () => {
      const tool = searchAgent.tools.get('search_web');
      const result = await tool?.handler({}, {});

      const parsedResult = JSON.parse(result as string);
      expect(parsedResult).toEqual({
        error: 'No query provided',
      });
    });

    it('should call duck-duck-scrape search with query', async () => {
      const mockResults = {
        noResults: false,
        vqd: 'test-vqd',
        results: [
          {
            hostname: 'example.com',
            title: 'Test Result',
            url: 'https://example.com',
            description: 'Test description',
            rawDescription: 'Test description',
            icon: '',
          },
        ],
      };

      mockedSearch.mockResolvedValue(mockResults as any);

      const tool = searchAgent.tools.get('search_web');
      const result = await tool?.handler({ query: 'test query' }, {});

      expect(mockedSearch).toHaveBeenCalledWith('test query', {
        safeSearch: 0,
        locale: 'en-us',
      });

      const parsedResult = JSON.parse(result as string);
      expect(parsedResult).toEqual({
        query: 'test query',
        domain: null,
        results: [
          {
            title: 'Test Result',
            url: 'https://example.com',
            snippet: 'Test description',
          },
        ],
      });
    });

    it('should search with domain filter when provided', async () => {
      const mockResults = {
        noResults: false,
        vqd: 'test-vqd',
        results: [
          {
            hostname: 'example.com',
            title: 'Domain Result',
            url: 'https://example.com/page',
            description: 'Domain specific result',
            rawDescription: 'Domain specific result',
            icon: '',
          },
        ],
      };

      mockedSearch.mockResolvedValue(mockResults as any);

      const tool = searchAgent.tools.get('search_web');
      const result = await tool?.handler({ query: 'test', domain: 'example.com' }, {});

      expect(mockedSearch).toHaveBeenCalledWith('test site:example.com', {
        safeSearch: 0,
        locale: 'en-us',
      });

      const parsedResult = JSON.parse(result as string);
      expect(parsedResult.domain).toBe('example.com');
    });

    it('should handle results without description', async () => {
      const mockResults = {
        noResults: false,
        vqd: 'test-vqd',
        results: [
          {
            hostname: 'example.com',
            title: 'Result without description',
            url: 'https://example.com',
            description: '',
            rawDescription: '',
            icon: '',
          },
        ],
      };

      mockedSearch.mockResolvedValue(mockResults as any);

      const tool = searchAgent.tools.get('search_web');
      const result = await tool?.handler({ query: 'test' }, {});

      const parsedResult = JSON.parse(result as string);
      expect(parsedResult.results[0].snippet).toBe('');
    });

    it('should handle multiple results and limit to 5', async () => {
      const mockResults = {
        noResults: false,
        vqd: 'test-vqd',
        results: [
          { hostname: 'example1.com', title: 'Result 1', url: 'https://example1.com', description: 'Description 1', rawDescription: '', icon: '' },
          { hostname: 'example2.com', title: 'Result 2', url: 'https://example2.com', description: 'Description 2', rawDescription: '', icon: '' },
          { hostname: 'example3.com', title: 'Result 3', url: 'https://example3.com', description: 'Description 3', rawDescription: '', icon: '' },
          { hostname: 'example4.com', title: 'Result 4', url: 'https://example4.com', description: 'Description 4', rawDescription: '', icon: '' },
          { hostname: 'example5.com', title: 'Result 5', url: 'https://example5.com', description: 'Description 5', rawDescription: '', icon: '' },
          { hostname: 'example6.com', title: 'Result 6', url: 'https://example6.com', description: 'Description 6', rawDescription: '', icon: '' },
        ],
      };

      mockedSearch.mockResolvedValue(mockResults as any);

      const tool = searchAgent.tools.get('search_web');
      const result = await tool?.handler({ query: 'multiple' }, {});

      const parsedResult = JSON.parse(result as string);
      expect(parsedResult.results).toHaveLength(5);
    });

    it('should handle search errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockedSearch.mockRejectedValue(new Error('Search API error'));

      const tool = searchAgent.tools.get('search_web');
      const result = await tool?.handler({ query: 'error test' }, {});

      const parsedResult = JSON.parse(result as string);
      expect(parsedResult).toEqual({
        error: 'Search failed',
        details: 'Search API error',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle empty search results', async () => {
      const mockResults = {
        noResults: true,
        vqd: 'test-vqd',
        results: [],
      };

      mockedSearch.mockResolvedValue(mockResults as any);

      const tool = searchAgent.tools.get('search_web');
      const result = await tool?.handler({ query: 'no results' }, {});

      const parsedResult = JSON.parse(result as string);
      expect(parsedResult.results).toEqual([]);
    });
  });
});
