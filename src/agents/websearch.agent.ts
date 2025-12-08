import { IAgent, ITool } from './type';
import { SearxngClient } from '@agentic/searxng';

export class WebSearchAgent implements IAgent {
  name = 'websearch';
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }

  shouldHandle(req: any, config: any): boolean {
    // Only activate when websearch_api is configured
    return !!config.websearch_api;
  }

  reqHandler(req: any, _config: any) {
    // Inject system prompt to guide the LLM on when to use web search
    if (!req.body.system) {
      req.body.system = [];
    }

    req.body.system.push({
      type: 'text',
      text: `You have access to a web search tool called 'web_search'. Use it to find current information, recent events, up-to-date statistics, or any data that may have changed since your training.

When you need to search the web:
1. Call the 'web_search' tool with a clear, specific query
2. Wait for the search results
3. Use the information from the results to answer the user's question
4. Always cite the source URLs when presenting information from search results

Use web_search for:
- Recent news and current events
- Current prices, statistics, or data
- Information that may have changed or updated
- Specific URLs or online resources the user mentions`,
    });
  }

  appendTools() {
    this.tools.set('web_search', {
      name: 'web_search',
      description:
        'Search the web using SearXNG for current information, news, statistics, or any data that may have changed since training. Returns up to 5 relevant results with titles, URLs, and snippets.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute. Be specific and clear.',
          },
          category: {
            type: 'string',
            description: 'Optional search category filter',
            enum: ['general', 'news', 'images', 'videos', 'files', 'science', 'it'],
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5, max: 10)',
          },
        },
        required: ['query'],
      },
      handler: async (args, context) => {
        const { query, category, maxResults = 5 } = args;
        const { config, req } = context;

        // Validate websearch_api configuration
        if (!config.websearch_api) {
          return 'Web search is not configured. Please add websearch_api to the configuration.';
        }

        req.log?.info?.({
          msg: 'SearXNG search request started',
          query: query,
          category: category,
          endpoint: config.websearch_api,
        });

        try {
          // Create SearXNG client
          const client = new SearxngClient({
            apiBaseUrl: config.websearch_api,
          });

          // Execute search
          const searchParams: any = { query };
          if (category) {
            searchParams.category = category;
          }

          const results = await client.search(searchParams);

          if (!results || !results.results || results.results.length === 0) {
            req.log?.info?.({
              msg: 'SearXNG search completed with no results',
              query: query,
            });
            return `No results found for query: "${query}"`;
          }

          // Limit results
          const limit = Math.min(maxResults, 10);
          const topResults = results.results.slice(0, limit);

          req.log?.info?.({
            msg: 'SearXNG search completed successfully',
            query: query,
            totalResults: results.results.length,
            returnedResults: topResults.length,
          });

          // Format results
          const formattedResults = topResults
            .map(
              (r: any, i: number) =>
                `${i + 1}. **${r.title || 'Untitled'}**
   URL: ${r.url || 'No URL'}
   ${r.content || r.snippet || 'No description available'}`
            )
            .join('\n\n');

          return `Web Search Results for "${query}":

Found ${results.results.length} results (showing ${topResults.length}):

${formattedResults}

---
Note: Please cite the URLs when using this information.`;
        } catch (error: any) {
          req.log?.error?.({
            msg: 'SearXNG search failed',
            query: query,
            error: error.message,
          });

          return `Web search failed: ${error.message}. Please try again with a different query.`;
        }
      },
    });
  }
}

export const webSearchAgent = new WebSearchAgent();
