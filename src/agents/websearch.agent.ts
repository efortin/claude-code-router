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
    // Enable web search agent if websearch_api is configured
    return !!config.websearch_api;
  }

  appendTools() {
    this.tools.set('webSearch', {
      name: 'webSearch',
      description:
        'Search the web for current information, facts, news, or any topic that requires up-to-date knowledge. Use this when you need information that may not be in your training data or when the user asks about recent events, current statistics, or specific online resources.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute. Be specific and clear.',
          },
          categories: {
            type: 'array',
            description:
              'Optional categories to filter search results (e.g., general, news, images, videos, it, science)',
            items: {
              type: 'string',
            },
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5, max: 10)',
          },
        },
        required: ['query'],
      },
      handler: async (args, context) => {
        const { query, categories, maxResults = 5 } = args;
        const endpoint = context.config.websearch_api || 'http://localhost:8080';

        try {
          // Initialize SearXNG client
          const client = new SearxngClient({
            apiBaseUrl: endpoint,
          });

          // Execute search
          const searchParams: any = {
            q: query,
          };

          if (categories && Array.isArray(categories) && categories.length > 0) {
            searchParams.categories = categories.join(',');
          }

          const results = await client.search(searchParams);

          if (!results || !results.results || results.results.length === 0) {
            return 'No results found for the query.';
          }

          // Format results
          const limitedResults = results.results.slice(0, Math.min(maxResults, 10));
          const formattedResults = limitedResults.map((result: any, index: number) => {
            const title = result.title || 'Untitled';
            const url = result.url || '';
            const content = result.content || result.snippet || 'No description available';
            return `${index + 1}. **${title}**
   URL: ${url}
   ${content}`;
          });

          const responseText = `Found ${results.results.length} results (showing ${limitedResults.length}):

${formattedResults.join('\n\n')}`;

          return responseText;
        } catch (error: any) {
          context.req.log?.error?.('Web search error:', error);
          return `Error performing web search: ${error.message || 'Unknown error'}. Please try again or rephrase your query.`;
        }
      },
    });
  }

  reqHandler(req: any, _config: any) {
    // Inject system prompt to inform the model about web search capability
    if (!req.body.system) {
      req.body.system = [];
    }

    req.body.system.push({
      type: 'text',
      text: `You have access to a web search tool that can retrieve current information from the internet.

When the user asks about:
- Recent events, news, or current affairs
- Up-to-date statistics or data
- Information that may have changed since your training
- Specific URLs or online resources
- Any topic where real-time information would be valuable

You should use the \`webSearch\` tool to get accurate, current information.

Always cite the sources (URLs) when presenting information from web search results.`,
    });
  }
}

export const webSearchAgent = new WebSearchAgent();
