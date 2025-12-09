import { IAgent, ITool } from './type';

export class MCPSearchAgent implements IAgent {
  name = 'mcp-search';
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }
  
  appendTools() {
    // Intercept legacy WebSearch calls and redirect to MCP
    this.tools.set('WebSearch', {
      name: 'WebSearch',
      description: 'DEPRECATED: Use brave_web_search MCP tool instead',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const { query } = args;
        console.log(`[WebSearch] Intercepted call for query: "${query}"`);
        console.log(`[WebSearch] Redirecting to MCP brave_web_search tool`);
        
        return `ERROR: WebSearch tool is deprecated. Please use the MCP tool "brave_web_search" instead with query: "${query}"

To use MCP tools:
1. Ensure brave-search MCP server is configured
2. Call brave_web_search directly instead of WebSearch

Example: brave_web_search(query: "${query}")`;
      },
    });
  }

  shouldHandle(req: any, _config: any): boolean {
    // Always handle to inject MCP search guidance
    return req.url?.startsWith('/v1/messages');
  }

  reqHandler(req: any, _config: any) {
    if (!req.body.system) {
      req.body.system = [];
    }

    if (Array.isArray(req.body.system)) {
      req.body.system.push({
        type: 'text',
        text: `# Web Search Guidelines

You have access to these search tools:
- **brave_web_search**: Search the web for current information (PRIMARY TOOL)
- **brave_local_search**: Search for local businesses and places

IMPORTANT: Do NOT use "WebSearch" tool - it is deprecated. Always use "brave_web_search" instead.

## When to Use brave_web_search

You MUST use brave_web_search when the user asks for:
- Latest versions, releases, or updates
- Current pricing, costs, or billing information
- Recent news, events, or developments
- Documentation, tutorials, or guides
- Comparisons, reviews, or evaluations
- Any information that may be outdated in your training data
- Real-time or location-specific information

## Search Strategy

1. **Use brave_web_search FIRST** for online queries
2. **Formulate clear queries** - be specific and concise
3. **Review results** before answering
4. **Cite sources** when providing information from searches

## Important Rules

- ALWAYS use brave_web_search for queries requiring current information
- Do NOT answer from memory when a search is appropriate
- Use brave_local_search for location-based queries
- Keep search queries focused and relevant

Follow these guidelines EXACTLY.`,
        cache_control: { type: 'ephemeral' },
      });
    }
  }
}

export const mcpSearchAgent = new MCPSearchAgent();
