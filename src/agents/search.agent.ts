import { IAgent, ITool } from './type';
import { search } from 'duck-duck-scrape';

export class SearchAgent implements IAgent {
  name = 'search';
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
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
        try {
          const { query, domain } = args;

          if (!query) {
            return JSON.stringify({
              error: 'No query provided',
            });
          }

          const searchQuery = domain ? `${query} site:${domain}` : query;
          const searchResults = await search(searchQuery, {
            safeSearch: 0,
            locale: 'en-us',
          });

          const results = searchResults.results.slice(0, 5).map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.description || '',
          }));

          return JSON.stringify({
            query,
            domain: domain || null,
            results,
          });
        } catch (err: any) {
          console.error('DuckDuckGo search error:', err);
          return JSON.stringify({
            error: 'Search failed',
            details: err.message,
          });
        }
      },
    });
  }
}

export const searchAgent = new SearchAgent();
