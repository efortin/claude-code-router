import { IAgent, ITool } from './type';
import { SearxngClient } from '@agentic/searxng';

export class WebSearchAgent implements IAgent {
  name = 'websearch';
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }

  shouldHandle(_req: any, config: any): boolean {
    // Only activate when websearch_api is configured
    return !!config.websearch_api;
  }

  reqHandler(_req: any, _config: any) {
    // No system prompt injection needed - the tool definition is enough
  }

  appendTools() {
    this.tools.set('web_search', {
      name: 'web_search',
      type: 'web_search_20250305',
      description:
        'Search the web for current information. Use this when you need up-to-date information, recent news, or data that may have changed since your training.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
      handler: async (args, context) => {
        const { query } = args;
        const { config } = context;

        if (!config.websearch_api) {
          return 'Web search is not configured.';
        }

        console.log(`[WebSearch Agent] Searching for: ${query}`);

        try {
          const client = new SearxngClient({ apiBaseUrl: config.websearch_api });
          const results = await client.search({ query });
          const searchResults = results?.results || (Array.isArray(results) ? results : []);

          if (!searchResults.length) {
            return `No results found for: "${query}"`;
          }

          const topResults = searchResults.slice(0, 5);
          console.log(`[WebSearch Agent] Found ${searchResults.length} results`);

          const formatted = topResults
            .map(
              (r: any, i: number) =>
                `${i + 1}. ${r.title || 'Untitled'}\n   URL: ${r.url || ''}\n   ${r.content || r.snippet || ''}`
            )
            .join('\n\n');

          return `Search results for "${query}":\n\n${formatted}`;
        } catch (error: any) {
          console.error(`[WebSearch Agent] Error: ${error.message}`);
          return `Search failed: ${error.message}`;
        }
      },
    });
  }
}

export const webSearchAgent = new WebSearchAgent();
