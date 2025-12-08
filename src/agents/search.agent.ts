import { IAgent, ITool } from './type';
import { search } from 'duck-duck-scrape';

export class SearchAgent implements IAgent {
  name = 'search';
  tools: Map<string, ITool>;
  private lastRequestTime = 0;
  private minRequestInterval = 3000;
  private requestQueue: Promise<any> = Promise.resolve();

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }

  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    const executeNext = async (): Promise<T> => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minRequestInterval) {
        const waitTime = this.minRequestInterval - timeSinceLastRequest;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      this.lastRequestTime = Date.now();
      return await fn();
    };

    this.requestQueue = this.requestQueue.then(executeNext, executeNext);
    return this.requestQueue;
  }

  shouldHandle(_req: any, _config: any): boolean {
    return true;
  }

  reqHandler(_req: any, _config: any) {}

  appendTools() {
    this.tools.set('search_web', {
      name: 'search_web',
      description: 'Performs a web search using DuckDuckGo and returns relevant results.',
      input_schema: {
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
      },
      handler: async (args, _context) => {
        return this.executeWithRateLimit(async () => {
          try {
            const { query, domain } = args;

            if (!query) {
              return JSON.stringify({
                error: 'No query provided',
              });
            }

            const searchQuery = domain ? `${query} site:${domain}` : query;
            console.log(`[SearchAgent] Executing search: "${searchQuery}"`);

            const searchResults = await search(searchQuery, {
              safeSearch: 0,
              locale: 'en-us',
            });

            const results = searchResults.results.slice(0, 5).map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.description || '',
            }));

            console.log(`[SearchAgent] Found ${results.length} results`);

            return JSON.stringify({
              query,
              domain: domain || null,
              results,
            });
          } catch (err: any) {
            console.error('DuckDuckGo search error:', err);

            if (err.message?.includes('anomaly') || err.message?.includes('too quickly')) {
              return JSON.stringify({
                error: 'Rate limit exceeded',
                details:
                  'Search requests are rate-limited. Please wait a moment before trying again.',
              });
            }

            return JSON.stringify({
              error: 'Search failed',
              details: err.message,
            });
          }
        });
      },
    });
  }
}

export const searchAgent = new SearchAgent();
