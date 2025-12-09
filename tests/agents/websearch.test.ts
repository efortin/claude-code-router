import { webSearchAgent } from '../../src/agents/websearch.agent';

// Mock @agentic/searxng
jest.mock('@agentic/searxng', () => ({
  SearxngClient: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockResolvedValue({
      results: [
        { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1' },
        { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2' },
      ],
    }),
  })),
}));

describe('WebSearchAgent', () => {
  it('should be defined', () => {
    expect(webSearchAgent).toBeDefined();
    expect(webSearchAgent.name).toBe('websearch');
  });

  it('should have WebSearch and Fetch tools', () => {
    expect(webSearchAgent.tools.size).toBe(2);
    expect(webSearchAgent.tools.has('WebSearch')).toBe(true);
    expect(webSearchAgent.tools.has('Fetch')).toBe(true);
  });

  it('should handle when websearch_api is configured', () => {
    const req = {};
    const config = { websearch_api: 'http://searxng.local' };
    expect(webSearchAgent.shouldHandle(req, config)).toBe(true);
  });

  it('should not handle when websearch_api is not configured', () => {
    const req = {};
    const config = {};
    expect(webSearchAgent.shouldHandle(req, config)).toBe(false);
  });
});
