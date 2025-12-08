import Server from '@musistudio/llms';
import { readConfigFile, writeConfigFile, backupConfigFile } from './utils';
import { checkForUpdates, performUpdate } from './utils';
import { join } from 'path';
import fastifyStatic from '@fastify/static';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { calculateTokenCount } from './utils/router';
import { SearxngClient } from '@agentic/searxng';

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // WebSearch endpoint - handles tool_use calls for WebSearch
  server.app.post('/v1/websearch', async (req, reply) => {
    // Try multiple sources for websearch_api config
    const websearchApi =
      config.initialConfig?.websearch_api ||
      server.app._server?.config?.websearch_api ||
      process.env.WEBSEARCH_API;

    if (!websearchApi) {
      return reply.status(500).send({
        error: { message: 'websearch_api not configured', type: 'configuration_error' },
      });
    }

    try {
      // Extract query from the request
      const messages = req.body.messages || [];
      let query: string | null = null;
      let toolCallId = 'search';

      // Look for tool_use in assistant messages (Anthropic format)
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.role === 'assistant' && Array.isArray(message.content)) {
          const toolUse = message.content.find(
            (block: any) =>
              block.type === 'tool_use' &&
              (block.name === 'WebSearch' ||
                block.name === 'web_search' ||
                block.name === 'webSearch')
          );
          if (toolUse) {
            query = toolUse.input?.query;
            toolCallId = toolUse.id || 'search';
            break;
          }
        }
      }

      // Fallback: try to get query from last user message content
      if (!query) {
        const lastMessage = messages[messages.length - 1];
        if (typeof lastMessage?.content === 'string') {
          query = lastMessage.content;
        } else if (Array.isArray(lastMessage?.content)) {
          const textBlock = lastMessage.content.find((c: any) => c.type === 'text');
          query = textBlock?.text;
        }
      }

      if (!query) {
        console.log('[WebSearch] No query found in request');
        return reply.status(400).send({
          error: { message: 'No search query found in request', type: 'invalid_request_error' },
        });
      }

      console.log(`[WebSearch] Executing search for: ${query}`);

      // Execute search using SearXNG
      const client = new SearxngClient({ apiBaseUrl: websearchApi });
      const results = await client.search({ query });

      let resultText: string;
      if (!results || !results.results || results.results.length === 0) {
        resultText = `No results found for query: "${query}"`;
      } else {
        const topResults = results.results.slice(0, 5);
        const formattedResults = topResults
          .map(
            (r: any, i: number) =>
              `${i + 1}. **${r.title || 'Untitled'}**\n   URL: ${r.url || ''}\n   ${r.content || r.snippet || 'No description'}`
          )
          .join('\n\n');

        resultText = `Web Search Results for "${query}":\n\nFound ${results.results.length} results (showing ${topResults.length}):\n\n${formattedResults}`;
      }

      console.log(`[WebSearch] Search completed, result length: ${resultText.length}`);

      // Return in the format Claude Code expects
      return reply.send({
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolCallId,
            content: resultText,
          },
        ],
        model: 'websearch',
        stop_reason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    } catch (error: any) {
      console.error('[WebSearch] Search failed:', error);
      return reply.status(500).send({
        error: { message: `Search failed: ${error.message}`, type: 'internal_error' },
      });
    }
  });

  server.app.post('/v1/messages/count_tokens', async (req, _reply) => {
    const { messages, tools, system } = req.body;
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { input_tokens: tokenCount };
  });

  // Add endpoint to read config.json with access control
  server.app.get('/api/config', async (_req, _reply) => {
    return await readConfigFile();
  });

  server.app.get('/api/transformers', async () => {
    const transformers = server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(([name, transformer]: any) => ({
      name,
      endpoint: transformer.endPoint || null,
    }));
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post('/api/config', async (req, _reply) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: 'Config saved successfully' };
  });

  // Add endpoint to restart the service with access control
  server.app.post('/api/restart', async (req, reply) => {
    reply.send({ success: true, message: 'Service restart initiated' });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require('child_process');
      spawn(process.execPath, [process.argv[1], 'restart'], {
        detached: true,
        stdio: 'ignore',
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, '..', 'dist'),
    prefix: '/ui/',
    maxAge: '1h',
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get('/ui', async (_, reply) => {
    return reply.redirect('/ui/');
  });

  // Version check endpoint
  server.app.get('/api/update/check', async (req, reply) => {
    try {
      // Get current version
      const currentVersion = require('../package.json').version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);

      return {
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined,
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      reply.status(500).send({ error: 'Failed to check for updates' });
    }
  });

  // Perform update endpoint
  server.app.post('/api/update/perform', async (req, reply) => {
    try {
      // Only allow users with full access permissions to perform updates
      const accessLevel = (req as any).accessLevel || 'restricted';
      if (accessLevel !== 'full') {
        reply.status(403).send('Full access required to perform updates');
        return;
      }

      // Execute update logic
      const result = await performUpdate();

      return result;
    } catch (error) {
      console.error('Failed to perform update:', error);
      reply.status(500).send({ error: 'Failed to perform update' });
    }
  });

  // Get log files list endpoint
  server.app.get('/api/logs/files', async (req, reply) => {
    try {
      const logDir = join(homedir(), '.claude-code-router', 'logs');
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> =
        [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
            });
          }
        }

        // Sort by modification time in descending order
        logFiles.sort(
          (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
        );
      }

      return logFiles;
    } catch (error) {
      console.error('Failed to get log files:', error);
      reply.status(500).send({ error: 'Failed to get log files' });
    }
  });

  // Get log content endpoint
  server.app.get('/api/logs', async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // If file path is specified, use the specified path
        logFilePath = filePath;
      } else {
        // If no file path is specified, use the default log file path
        logFilePath = join(homedir(), '.claude-code-router', 'logs', 'app.log');
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter((line) => line.trim());

      return logLines;
    } catch (error) {
      console.error('Failed to get logs:', error);
      reply.status(500).send({ error: 'Failed to get logs' });
    }
  });

  // Clear log content endpoint
  server.app.delete('/api/logs', async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // If file path is specified, use the specified path
        logFilePath = filePath;
      } else {
        // If no file path is specified, use the default log file path
        logFilePath = join(homedir(), '.claude-code-router', 'logs', 'app.log');
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: 'Logs cleared successfully' };
    } catch (error) {
      console.error('Failed to clear logs:', error);
      reply.status(500).send({ error: 'Failed to clear logs' });
    }
  });

  return server;
};
