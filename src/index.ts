import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { initConfig, initDir } from './utils';
import { createServer } from './server';
import { router } from './utils/router';
import { apiKeyAuth, forwardAuthHeader } from './middleware/auth';
import { cleanupPidFile, isServiceRunning, savePid } from './utils/processCheck';
import { CONFIG_FILE } from './constants';
import { sessionUsageCache } from './utils/cache';
import { SSEParserTransform } from './utils/SSEParser.transform';
import { SSESerializerTransform } from './utils/SSESerializer.transform';
import { rewriteStream } from './utils/rewriteStream';
import JSON5 from 'json5';
import { IAgent } from './agents/type';
import agentsManager from './agents';
import { EventEmitter } from 'node:events';

const event = new EventEmitter();

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, '.claude.json');
  if (!existsSync(configPath)) {
    const userID = Array.from({ length: 64 }, () => Math.random().toString(16)[2]).join('');
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: 'enabled',
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: '1.0.17',
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

async function run(_options: RunOptions = {}) {
  // Check if service is already running
  const isRunning = await isServiceRunning();
  if (isRunning) {
    console.log('✅ Service is already running in the background.');
    return;
  }

  await initializeClaudeConfig();
  await initDir();
  const config = await initConfig();

  const HOST = config.HOST || '127.0.0.1';
  const port = config.PORT || 3456;

  // Save the PID of the background process
  savePid(process.pid);

  // Handle SIGINT (Ctrl+C) to clean up PID file
  process.on('SIGINT', () => {
    console.log('Received SIGINT, cleaning up...');
    cleanupPidFile();
    process.exit(0);
  });

  // Handle SIGTERM to clean up PID file
  process.on('SIGTERM', () => {
    cleanupPidFile();
    process.exit(0);
  });

  // Use port from environment variable if set
  const servicePort = process.env.SERVICE_PORT ? parseInt(process.env.SERVICE_PORT) : port;

  // Container mode: logs to stdout/stderr only
  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || 'info',
          // No stream specified = logs go to stdout
        }
      : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      auth: forwardAuthHeader,
    },
    logger: loggerConfig,
  });

  // Add global error handlers to prevent the service from crashing
  process.on('uncaughtException', (err) => {
    server.logger.error('Uncaught exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    server.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  });
  // Add async preHandler hook for authentication
  server.addHook('preHandler', async (req, reply) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });
  server.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/v1/messages') && !req.url.startsWith('/v1/messages/count_tokens')) {
      // Initialize tool usage tracking
      req.toolUsage = {
        web_search_requests: 0,
      };

      const useAgents = [];

      for (const agent of agentsManager.getAllAgents()) {
        if (agent.shouldHandle(req, config)) {
          // Set agent identifier
          useAgents.push(agent.name);

          // change request body
          agent.reqHandler(req, config);

          // append agent tools
          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = [];
            }
            req.body.tools.unshift(
              ...Array.from(agent.tools.values()).map((item) => {
                return {
                  name: item.name,
                  description: item.description,
                  input_schema: item.input_schema,
                };
              })
            );
          }
        }
      }

      if (useAgents.length) {
        req.agents = useAgents;
      }
      await router(req, reply, {
        config,
        event,
      });
    }
  });
  server.addHook('onError', async (request, reply, error) => {
    event.emit('onError', request, reply, error);
  });
  server.addHook('onSend', (req, reply, payload, done) => {
    if (
      req.sessionId &&
      req.url.startsWith('/v1/messages') &&
      !req.url.startsWith('/v1/messages/count_tokens')
    ) {
      if (payload instanceof ReadableStream) {
        if (req.agents) {
          const abortController = new AbortController();
          const eventStream = payload.pipeThrough(new SSEParserTransform());
          let currentAgent: undefined | IAgent;
          let currentToolIndex = -1;
          let currentToolName = '';
          let currentToolArgs = '';
          let currentToolId = '';
          const toolMessages: any[] = [];
          const assistantMessages: any[] = [];
          // Store Anthropic format message body, distinguishing text and tool types
          return done(
            null,
            rewriteStream(eventStream, async (data, controller) => {
              try {
                // Detect tool call start
                if (data.event === 'content_block_start' && data?.data?.content_block?.name) {
                  const agent = req.agents.find((name: string) =>
                    agentsManager.getAgent(name)?.tools.get(data.data.content_block.name)
                  );
                  if (agent) {
                    currentAgent = agentsManager.getAgent(agent);
                    currentToolIndex = data.data.index;
                    currentToolName = data.data.content_block.name;
                    currentToolId = data.data.content_block.id;
                    return undefined;
                  }
                }

                // Collect tool parameters
                if (
                  currentToolIndex > -1 &&
                  data.data.index === currentToolIndex &&
                  data.data?.delta?.type === 'input_json_delta'
                ) {
                  currentToolArgs += data.data?.delta?.partial_json;
                  return undefined;
                }

                // Tool call completed, process agent call
                if (
                  currentToolIndex > -1 &&
                  data.data.index === currentToolIndex &&
                  data.data.type === 'content_block_stop'
                ) {
                  try {
                    const args = JSON5.parse(currentToolArgs);
                    assistantMessages.push({
                      type: 'tool_use',
                      id: currentToolId,
                      name: currentToolName,
                      input: args,
                    });
                    const toolResult = await currentAgent?.tools
                      .get(currentToolName)
                      ?.handler(args, {
                        req,
                        config,
                      });
                    toolMessages.push({
                      tool_use_id: currentToolId,
                      type: 'tool_result',
                      content: toolResult,
                    });
                    currentAgent = undefined;
                    currentToolIndex = -1;
                    currentToolName = '';
                    currentToolArgs = '';
                    currentToolId = '';
                  } catch (e) {
                    console.log(e);
                  }
                  return undefined;
                }

                if (data.event === 'message_delta' && toolMessages.length) {
                  req.body.messages.push({
                    role: 'assistant',
                    content: assistantMessages,
                  });
                  req.body.messages.push({
                    role: 'user',
                    content: toolMessages,
                  });
                  const response = await fetch(
                    `http://127.0.0.1:${config.PORT || 3456}/v1/messages`,
                    {
                      method: 'POST',
                      headers: {
                        'content-type': 'application/json',
                      },
                      body: JSON.stringify(req.body),
                    }
                  );
                  if (!response.ok) {
                    return undefined;
                  }
                  const stream = response.body!.pipeThrough(new SSEParserTransform());
                  const reader = stream.getReader();
                  while (true) {
                    try {
                      const { value, done } = await reader.read();
                      if (done) {
                        break;
                      }
                      if (['message_start', 'message_stop'].includes(value.event)) {
                        continue;
                      }

                      // Check if stream is still writable
                      if (!controller.desiredSize) {
                        break;
                      }

                      controller.enqueue(value);
                    } catch (readError: any) {
                      if (
                        readError.name === 'AbortError' ||
                        readError.code === 'ERR_STREAM_PREMATURE_CLOSE'
                      ) {
                        abortController.abort(); // Abort all related operations
                        break;
                      }
                      throw readError;
                    }
                  }
                  return undefined;
                }
                return data;
              } catch (error: any) {
                console.error('Unexpected error in stream processing:', error);

                // Handle stream premature close error
                if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                  abortController.abort();
                  return undefined;
                }

                // Other errors still throw
                throw error;
              }
            }).pipeThrough(new SSESerializerTransform())
          );
        }

        // Track WebSearch tool calls and inject usage into stream
        let webSearchCount = 0;

        const transformedStream = rewriteStream(payload, async (chunk: Uint8Array) => {
          const dataStr = new TextDecoder().decode(chunk);

          // Detect and execute XML-style tool calls from qwen3-coder
          if (dataStr.includes('<function=WebSearch>') || dataStr.includes('<function=Fetch>')) {
            webSearchCount++;
            console.log(`[Usage] XML tool call detected, total: ${webSearchCount}`);

            const functionMatch = dataStr.match(/<function=(\w+)>/);
            const paramMatch = dataStr.match(/<parameter=(\w+)>\s*([^<]+)/);

            if (functionMatch && paramMatch && req.agents?.includes('websearch')) {
              const toolName = functionMatch[1];
              const paramName = paramMatch[1];
              const paramValue = paramMatch[2].trim();

              console.log(`[XML Parser] Executing ${toolName}(${paramName}: "${paramValue}")`);

              const agent = agentsManager.getAgent('websearch');
              if (agent && agent.tools.has(toolName)) {
                try {
                  const result = await agent.tools
                    .get(toolName)!
                    .handler({ [paramName]: paramValue }, { req, config });

                  const modifiedStr = dataStr.replace(
                    /<function=\w+>[\s\S]*?(<\/function>)?/g,
                    `\n\n${result}\n\n`
                  );
                  return new TextEncoder().encode(modifiedStr);
                } catch (error: any) {
                  console.error(`[XML Parser] Error: ${error.message}`);
                }
              }
            }
          }

          // Count WebSearch tool_use events (standard JSON format)
          if (dataStr.includes('"name":"WebSearch"') || dataStr.includes('"name": "WebSearch"')) {
            webSearchCount++;
            console.log(`[Usage] WebSearch call detected, total: ${webSearchCount}`);
          }

          // Inject usage into message_delta events
          if (dataStr.startsWith('event: message_delta') && webSearchCount > 0) {
            const str = dataStr.slice(27);
            try {
              const message = JSON.parse(str);
              if (message.usage) {
                if (!message.usage.server_tool_use) {
                  message.usage.server_tool_use = {};
                }
                message.usage.server_tool_use.web_search_requests = webSearchCount;
                sessionUsageCache.put(req.sessionId, message.usage);

                // Return modified event
                const modifiedEvent = `event: message_delta\ndata: ${JSON.stringify(message)}\n\n`;
                return new TextEncoder().encode(modifiedEvent);
              }
            } catch {
              // If parse fails, return original
            }
          }

          // Return original chunk if not modified
          return chunk;
        });

        return done(null, transformedStream);
      }
      sessionUsageCache.put(req.sessionId, payload.usage);
      if (typeof payload === 'object') {
        if (payload.error) {
          return done(payload.error, null);
        } else {
          return done(payload, null);
        }
      }
    }
    if (typeof payload === 'object' && payload.error) {
      return done(payload.error, null);
    }
    done(null, payload);
  });
  server.addHook('onSend', async (req, reply, payload) => {
    event.emit('onSend', req, reply, payload);
    return payload;
  });

  server.start();
}

export { run };
// run();
