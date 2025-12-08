import { SearxngClient } from '@agentic/searxng';

export async function websearchMiddleware(req: any, config: any) {
  if (!config.websearch_api) {
    return; // Skip if not configured
  }

  // Get the last user message
  const messages = req.body.messages || [];
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage || lastMessage.role !== 'user') {
    return;
  }

  const userText =
    typeof lastMessage.content === 'string'
      ? lastMessage.content
      : lastMessage.content?.find((c: any) => c.type === 'text')?.text;

  if (!userText) {
    return;
  }

  // Detect if search is needed
  const searchPatterns = [
    /search (?:for|about) (.+)/i,
    /what (?:is|are) (?:the )?(latest|current|recent) (.+)/i,
    /(?:latest|current|recent) (?:news|information|data|price|pricing) (?:on|about|for) (.+)/i,
    /how much (?:does|do|is|are) (.+) cost/i,
    /(?:datadog|dd) (?:pricing|price|cost)(.+)?/i,
  ];

  let searchQuery = null;
  for (const pattern of searchPatterns) {
    const match = userText.match(pattern);
    if (match) {
      searchQuery = match[match.length - 1]?.trim() || userText;
      break;
    }
  }

  if (!searchQuery) {
    return; // No search pattern detected
  }

  console.log('[WebSearch] Detected search query:', searchQuery);
  console.log('[WebSearch] Original user text:', userText);

  // Log search request start
  req.log?.info?.({
    msg: 'SearXNG search request started',
    query: searchQuery,
    endpoint: config.websearch_api,
  });

  // Execute search
  try {
    const client = new SearxngClient({
      apiBaseUrl: config.websearch_api,
    });

    const results = await client.search({ query: searchQuery });

    // Handle potential response structure variations
    const searchResults = results?.results || (Array.isArray(results) ? results : []) || [];

    if (searchResults.length > 0) {
      console.log(`[WebSearch] Found ${searchResults.length} results`);

      // Log successful search
      req.log?.info?.({
        msg: 'SearXNG search completed successfully',
        query: searchQuery,
        totalResults: searchResults.length,
        returnedResults: Math.min(5, searchResults.length),
      });

      // Format top 5 results
      const topResults = searchResults.slice(0, 5);
      const formattedResults = topResults
        .map(
          (r: any, i: number) =>
            `${i + 1}. **${r.title || 'Untitled'}**\n   URL: ${r.url || ''}\n   ${r.content || r.snippet || 'No description available'}`
        )
        .join('\n\n');

      const searchContext = `Web Search Results for "${searchQuery}":\n\nFound ${searchResults.length} results (showing ${topResults.length}):\n\n${formattedResults}\n\n---\nPlease use the above search results to answer the user's question. Always cite the URLs when presenting information.`;

      console.log('[WebSearch] Injecting search results into context');

      // Inject search results as system context
      if (!req.body.system) {
        req.body.system = [];
      }

      req.body.system.push({
        type: 'text',
        text: searchContext,
      });
    } else {
      console.log(
        `[WebSearch] No results found. Raw structure keys: ${Object.keys(results || {})}`
      );

      // Log no results
      req.log?.info?.({
        msg: 'SearXNG search completed with no results',
        query: searchQuery,
      });
    }
  } catch (error: any) {
    console.error('[WebSearch] Search failed:', error);
    req.log?.error?.('Web search error:', error);
    // Don't fail the request, just skip enrichment
  }
}
