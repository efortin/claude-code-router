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
    return !!config.websearch_api;
  }

  reqHandler(req: any, _config: any) {
    if (!req.body.system) {
      req.body.system = [];
    }
    if (Array.isArray(req.body.system)) {
      req.body.system.push({
        type: 'text',
        text: `You are an AI assistant with web search capabilities.

You MUST call the "WebSearch" tool whenever the user asks for:
- pricing, cost, billing information
- current/latest/recent information
- documentation, APIs, tutorials
- comparisons, evaluations
- any factual information that may be outdated

WORKFLOW:
1. Use WebSearch first to find information
2. Optionally use Fetch to read full content from specific URLs
3. Answer using the search results

STRICT RULES:
- ALWAYS use WebSearch first for online information
- Do NOT answer from memory when search is needed
- Avoid unnecessary loops

Follow these instructions EXACTLY.`,
        cache_control: { type: 'ephemeral' },
      });
    }
  }

  appendTools() {
    this.tools.set('WebSearch', {
      name: 'WebSearch',
      description:
        'PRIMARY TOOL: Search the web for current information. Use this FIRST for any online query.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      handler: async (args, context) => {
        const { query } = args;
        const { config } = context;

        console.log(`[WebSearch] Searching: ${query}`);

        try {
          const client = new SearxngClient({ apiBaseUrl: config.websearch_api });
          const results = await client.search({ query });
          const searchResults = results?.results || [];

          if (!searchResults.length) return `No results for: "${query}"`;

          const topResults = searchResults.slice(0, 5);
          const formatted = topResults
            .map((r: any, i: number) => {
              const content = (r.content || r.snippet || '').substring(0, 300);
              return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${content}`;
            })
            .join('\n\n');

          return `# Search: "${query}"\n\n${formatted}`;
        } catch (error: any) {
          return `Search failed: ${error.message}`;
        }
      },
    });

    this.tools.set('Fetch', {
      name: 'Fetch',
      description: 'SECONDARY: Fetch full content from a URL. Use AFTER WebSearch.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
      handler: async (args) => {
        const { url } = args;
        console.log(`[Fetch] Fetching: ${url}`);

        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) return `Failed: ${response.status}`;

          const html = await response.text();
          const { JSDOM } = await import('jsdom');
          const { Readability } = await import('@mozilla/readability');

          const dom = new JSDOM(html, { url });
          const article = new Readability(dom.window.document).parse();

          if (!article?.textContent) return `No content extracted from ${url}`;

          const content = article.textContent.substring(0, 3000);
          return `# ${article.title}\n\n${content}`;
        } catch (error: any) {
          return `Fetch failed: ${error.message}`;
        }
      },
    });
  }
}

export const webSearchAgent = new WebSearchAgent();
