import { IAgent, ITool } from './type';
import { SearxngClient } from '@agentic/searxng';
import { WebSearchResultBlock, WebSearchTool20250305 } from '@anthropic-ai/sdk/resources/messages';

// Tool definition matching Anthropic's WebSearchTool20250305 format
export const WEB_SEARCH_TOOL_DEFINITION: WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};

export interface WebSearchToolResult {
  results: WebSearchResultBlock[];
  searchCount: number;
}

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

          console.log(
            `[WebSearch Agent] Raw results structure: ${JSON.stringify(results).slice(0, 500)}...`
          );

          // Check if results exists and has items
          // Sometimes results might be directly in results (array) or results.results
          const searchResults = results?.results || (Array.isArray(results) ? results : []);

          if (!searchResults.length) {
            console.log(
              `[WebSearch Agent] No results found. Raw object keys: ${Object.keys(results || {})}`
            );
            return `No results found for: "${query}"`;
          }

          const topResults = searchResults.slice(0, 5);

          // Format results as WebSearchResultBlock array for proper Anthropic API format
          const formattedResults: WebSearchResultBlock[] = topResults.map((r: any) => ({
            type: 'web_search_result' as const,
            url: r.url || '',
            title: r.title || 'Untitled',
            encrypted_content: r.content || r.snippet || '', // SearXNG provides plain content, not encrypted
            page_age: r.publishedDate || null,
          }));

          console.log(`[WebSearch Agent] Found ${searchResults.length} results`);

          // Return formatted string for LLM consumption
          // The actual WebSearchResultBlock format is used internally
          const formatted = formattedResults
            .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.encrypted_content}`)
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
