import { SearxngClient } from '@agentic/searxng';

/**
 * SearxWrapper - A pseudo-LLM that intercepts web search requests
 * and returns SearXNG results directly in Anthropic message format
 */
export class SearxWrapper {
  private searxngUrl: string;

  constructor(searxngUrl: string) {
    this.searxngUrl = searxngUrl;
  }

  /**
   * Extract search query from user message
   */
  private extractSearchQuery(messages: any[]): string {
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUserMessage) return '';

    let content = '';
    if (typeof lastUserMessage.content === 'string') {
      content = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      const textPart = lastUserMessage.content.find((c: any) => c.type === 'text');
      content = textPart?.text || '';
    }

    // Extract query - remove common prefixes
    return content
      .replace(/^(search|look up|find|check on web|check online|what is|who is)/i, '')
      .trim();
  }

  /**
   * Perform search and format results
   */
  async search(query: string): Promise<string> {
    console.log(`[SearxWrapper] Searching for: ${query}`);

    try {
      const client = new SearxngClient({ apiBaseUrl: this.searxngUrl });
      const results = await client.search({ query });
      const searchResults = results?.results || (Array.isArray(results) ? results : []);

      if (!searchResults.length) {
        return `No results found for: "${query}"`;
      }

      const topResults = searchResults.slice(0, 5);
      console.log(`[SearxWrapper] Found ${searchResults.length} results, returning top 5`);

      // Try to fetch and extract content from the first result
      let enrichedContent = '';
      if (topResults[0]?.url) {
        try {
          const response = await fetch(topResults[0].url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            const html = await response.text();
            const { JSDOM } = await import('jsdom');
            const { Readability } = await import('@mozilla/readability');
            const dom = new JSDOM(html, { url: topResults[0].url });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            if (article?.textContent) {
              enrichedContent = article.textContent.substring(0, 2000).trim();
              console.log(`[SearxWrapper] Extracted ${enrichedContent.length} chars from article`);
            }
          }
        } catch (fetchError: any) {
          console.log(`[SearxWrapper] Could not fetch article: ${fetchError.message}`);
        }
      }

      const formatted = topResults
        .map((r: any, i: number) => {
          const content = (r.content || r.snippet || '').substring(0, 300);
          return `${i + 1}. **${r.title || 'Untitled'}**\n   URL: ${r.url || ''}\n   ${content}`;
        })
        .join('\n\n');

      let result = `# Search Results for "${query}"\n\n${formatted}`;
      if (enrichedContent) {
        result += `\n\n## Article Content from ${topResults[0].title}\n\n${enrichedContent}`;
      }

      return result;
    } catch (error: any) {
      console.error(`[SearxWrapper] Error: ${error.message}`);
      return `Search failed: ${error.message}`;
    }
  }

  /**
   * Process request and return Anthropic-format response
   */
  async processRequest(body: any): Promise<any> {
    const query = this.extractSearchQuery(body.messages || []);
    const searchResults = await this.search(query);

    // Return in Anthropic message format
    return {
      id: `searx-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: searchResults,
        },
      ],
      model: 'searx-web',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: searchResults.length / 4, // Rough estimate
        server_tool_use: {
          web_search_requests: 1,
        },
      },
    };
  }

  /**
   * Process streaming request
   */
  async *processStreamingRequest(body: any): AsyncGenerator<any> {
    const query = this.extractSearchQuery(body.messages || []);

    // Send message_start
    yield {
      type: 'message_start',
      message: {
        id: `searx-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'searx-web',
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      },
    };

    // Send content_block_start
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: '',
      },
    };

    // Get search results
    const searchResults = await this.search(query);

    // Send content in chunks
    const chunkSize = 50;
    for (let i = 0; i < searchResults.length; i += chunkSize) {
      const chunk = searchResults.substring(i, i + chunkSize);
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: chunk,
        },
      };
    }

    // Send content_block_stop
    yield {
      type: 'content_block_stop',
      index: 0,
    };

    // Send message_delta with usage
    yield {
      type: 'message_delta',
      delta: {
        stop_reason: 'end_turn',
        stop_sequence: null,
      },
      usage: {
        output_tokens: Math.floor(searchResults.length / 4),
        server_tool_use: {
          web_search_requests: 1,
        },
      },
    };

    // Send message_stop
    yield {
      type: 'message_stop',
    };
  }
}

export const createSearxWrapper = (searxngUrl: string) => new SearxWrapper(searxngUrl);
