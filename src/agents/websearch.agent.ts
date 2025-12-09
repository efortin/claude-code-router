import { IAgent, ITool } from './type';

export class WebSearchAgent implements IAgent {
  name = 'websearch';
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }

  shouldHandle(_req: any, _config: any): boolean {
    return true; // Always available, uses Startpage
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

        console.log(`[WebSearch] Searching Startpage: ${query}`);

        // Track usage
        if (context?.req?.toolUsage) {
          context.req.toolUsage.web_search_requests++;
        }

        try {
          const url = `https://startpage.com/sp/search?q=${encodeURIComponent(query)}`;
          const response = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html',
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) return `Search failed: ${response.status}`;

          const html = await response.text();
          const jsdom = await import('jsdom');
          const JSDOM = jsdom.JSDOM;

          const dom = new JSDOM(html, { url });
          const document = dom.window.document;

          // Parse Startpage results
          const results: Array<{ title: string; url: string; snippet: string }> = [];
          const resultElements = document.querySelectorAll('.w-gl__result');

          resultElements.forEach((el) => {
            const titleEl = el.querySelector('.w-gl__result-title');
            const urlEl = el.querySelector('.w-gl__result-url');
            const snippetEl = el.querySelector('.w-gl__description');

            if (titleEl && urlEl) {
              // Clean snippet text - remove extra whitespace and special chars
              let snippet = snippetEl?.textContent?.trim() || '';
              snippet = snippet
                .replace(/\s+/g, ' ') // Multiple spaces -> single space
                .replace(/[\n\r\t]+/g, ' ') // Newlines/tabs -> space
                .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Remove non-printable chars
                .trim();

              results.push({
                title: titleEl.textContent?.trim() || 'Untitled',
                url: urlEl.textContent?.trim() || '',
                snippet,
              });
            }
          });

          if (!results.length) return `No results found for: "${query}"`;

          const topResults = results.slice(0, 5);
          console.log(`[WebSearch] Found ${results.length} results from Startpage`);

          const formatted = topResults
            .map((r, i) => {
              const snippet = r.snippet.substring(0, 300);
              return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${snippet}`;
            })
            .join('\n\n');

          return `# Search: "${query}"\n\n${formatted}`;
        } catch (error: any) {
          console.error(`[WebSearch] Error: ${error.message}`);
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
          const jsdom = await import('jsdom');
          const JSDOM = jsdom.JSDOM;
          const readability = await import('@mozilla/readability');
          const Readability = readability.Readability;

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
