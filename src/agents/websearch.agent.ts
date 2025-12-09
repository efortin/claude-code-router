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

  reqHandler(req: any, _config: any) {
    // Add system prompt to enforce WebSearch-first workflow
    if (!req.body.system) {
      req.body.system = [];
    }
    if (Array.isArray(req.body.system)) {
      req.body.system.push({
        type: 'text',
        text: 'IMPORTANT: When searching for information online, ALWAYS use WebSearch tool first to find relevant sources. Only use Fetch tool after you have search results and need to read the full content of a specific URL. Never skip WebSearch when the user asks to search, find, or check information on the web.',
        cache_control: { type: 'ephemeral' },
      });
    }
  }

  appendTools() {
    // WebSearch tool - queries SearXNG for web results
    this.tools.set('WebSearch', {
      name: 'WebSearch',
      description:
        '**PRIMARY TOOL**: Search the web for current information. ALWAYS use this tool FIRST when asked to search, find, or check information online. Returns multiple search results with titles, URLs, and snippets. Use Fetch only after you have search results and need full content from a specific URL.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find information',
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
          console.log(`[WebSearch Agent] Found ${searchResults.length} results, returning top 5`);

          const formatted = topResults
            .map((r: any, i: number) => {
              const content = (r.content || r.snippet || '').substring(0, 300);
              return `${i + 1}. **${r.title || 'Untitled'}**\n   URL: ${r.url || ''}\n   ${content}`;
            })
            .join('\n\n');

          return `# Search Results for "${query}"\n\n${formatted}`;
        } catch (error: any) {
          console.error(`[WebSearch Agent] Error: ${error.message}`);
          return `Search failed: ${error.message}`;
        }
      },
    });

    // Fetch tool - retrieves and cleans content from a URL
    this.tools.set('Fetch', {
      name: 'Fetch',
      description:
        '**SECONDARY TOOL**: Fetch and extract clean content from a specific web page URL. Use this ONLY AFTER using WebSearch to find relevant URLs. Do NOT use this as your first step when searching for information. Returns the main article text without ads or navigation.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch content from',
          },
        },
        required: ['url'],
      },
      handler: async (args, _context) => {
        const { url } = args;

        console.log(`[Fetch Agent] Fetching: ${url}`);

        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });

          if (!response.ok) {
            return `Failed to fetch ${url}: ${response.status} ${response.statusText}`;
          }

          const html = await response.text();

          // Use readability to extract clean content
          const { JSDOM } = await import('jsdom');
          const { Readability } = await import('@mozilla/readability');

          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();

          if (!article || !article.textContent) {
            return `Could not extract readable content from ${url}`;
          }

          // Return cleaned content (limit to 3000 chars to avoid overwhelming the model)
          const content = article.textContent.substring(0, 3000).trim();
          console.log(`[Fetch Agent] Extracted ${content.length} chars from ${url}`);

          return `# Content from ${article.title || url}\n\n${content}`;
        } catch (error: any) {
          console.error(`[Fetch Agent] Error: ${error.message}`);
          return `Fetch failed: ${error.message}`;
        }
      },
    });
  }
}

export const webSearchAgent = new WebSearchAgent();
