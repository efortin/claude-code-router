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
import { createOpenAIStreamProcessor } from './utils/openaiStreamProcessor';

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

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT ? parseInt(process.env.SERVICE_PORT) : port;

  const server = await buildServer(config, servicePort, HOST);
  server.start();
}

export async function buildServer(config: any, port: number, host: string) {
  // Configure logger to always use stdout
  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || 'info',
          // No stream specified = logs go to stdout by default
        }
      : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || config.providers,
      HOST: host,
      PORT: port,
      LOG_FILE: join(homedir(), '.claude-code-router', 'claude-code-router.log'),
      auth: forwardAuthHeader, // Add auth function for key forwarding
      websearch_api: config.websearch_api, // Pass websearch_api to server
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
      // Convert Anthropic server-side tools to standard function tools
      if (Array.isArray(req.body?.tools)) {
        const originalTools = req.body.tools.map((t: any) => t.type || t.name).join(', ');
        req.body.tools = req.body.tools.map((tool: any) => {
          // Convert web_search_20250305 to standard function tool
          if (tool.type?.startsWith('web_search')) {
            console.log(`[Tools] Converting ${tool.type} to standard function tool`);
            return {
              name: tool.name || 'web_search',
              description:
                'Search the web for current information. You MUST use this tool when asked to search or find current information.',
              input_schema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The search query' },
                },
                required: ['query'],
              },
            };
          }
          return tool;
        });
        console.log(`[Tools] Original: ${originalTools}, Final count: ${req.body.tools.length}`);
      }

      const useAgents = [];
      const allAgents = agentsManager.getAllAgents();
      console.log(
        `[Debug] config.websearch_api = ${config.websearch_api}, agents: ${allAgents.map((a) => a.name).join(', ')}`
      );

      for (const agent of allAgents) {
        const shouldHandle = agent.shouldHandle(req, config);
        console.log(`[Debug] Agent ${agent.name} shouldHandle: ${shouldHandle}`);
        if (shouldHandle) {
          // Set agent identifier
          useAgents.push(agent.name);

          // change request body
          agent.reqHandler(req, config);

          // Replace or add agent tools
          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = [];
            }
            const agentToolNames = new Set(Array.from(agent.tools.keys()));
            // Remove existing tools that will be replaced by agent tools
            req.body.tools = req.body.tools.filter(
              (t: any) => !agentToolNames.has(t.name || t.function?.name)
            );
            // Add agent tools
            const newTools = Array.from(agent.tools.values()).map((item) => {
              const tool: any = {
                name: item.name,
                description: item.description,
                input_schema: item.input_schema,
              };
              if (item.type) {
                tool.type = item.type;
              }
              return tool;
            });
            if (newTools.length) {
              console.log(
                `[Agents] Adding/replacing tools: ${newTools.map((t) => t.name).join(', ')}`
              );
              req.body.tools.unshift(...newTools);
            }
          }
        }
      }

      console.log(`[Debug] After loop: useAgents = ${JSON.stringify(useAgents)}`);
      if (useAgents.length) {
        req.agents = useAgents;
        console.log(`[Agents] Active: ${useAgents.join(', ')}, stream=${req.body.stream}`);
        // Force streaming when agents are active - required for tool call interception
        if (req.body.stream === false) {
          console.log('[Agents] Forcing stream=true for agent tool handling');
          req.body.stream = true;
        }
        console.log(`[Agents] Final stream value: ${req.body.stream}`);
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
    if (req.url.startsWith('/v1/messages') && !req.url.startsWith('/v1/messages/count_tokens')) {
      if (payload instanceof ReadableStream) {
        // Handle agent tools (for image agent, etc.)
        if (req.agents) {
          const abortController = new AbortController();
          const eventStream = payload.pipeThrough(new SSEParserTransform());

          // State for Anthropic-format tool calls
          let currentAgent: undefined | IAgent;
          let currentToolIndex = -1;
          let currentToolName = '';
          let currentToolArgs = '';
          let currentToolId = '';
          const toolMessages: any[] = [];
          const assistantMessages: any[] = [];
          let webSearchCount = 0; // Track web search requests for usage reporting

          // Create OpenAI stream processor for handling OpenAI-format tool calls
          const activeAgents = req.agents
            .map((name: string) => agentsManager.getAgent(name))
            .filter((a: IAgent | undefined): a is IAgent => !!a);
          const openAIProcessor = createOpenAIStreamProcessor({
            agents: activeAgents,
            config,
            req,
          });

          // Store Anthropic format message body, distinguishing text and tool types
          return done(
            null,
            rewriteStream(eventStream, async (data, controller) => {
              try {
                // === OpenAI Format Tool Call Handling ===
                // Check if this is an OpenAI-format chunk with tool calls
                if (openAIProcessor.isOpenAIFormat(data.data)) {
                  const handled = openAIProcessor.processEvent(data.data);

                  // If we handled a tool call chunk, suppress it from output
                  if (handled) {
                    return undefined;
                  }

                  // Check if we hit end of stream with tool calls to execute
                  const finishReason = openAIProcessor.getFinishReason();
                  if (
                    openAIProcessor.hasToolCalls() &&
                    (finishReason === 'tool_calls' ||
                      finishReason === 'stop' ||
                      data.event === 'message_delta')
                  ) {
                    // Execute the accumulated tool calls
                    console.log('[OpenAI Tool Handler] Executing tool calls...');
                    const results = await openAIProcessor.executeToolCalls();
                    webSearchCount += openAIProcessor.getWebSearchCount();

                    // Build messages for continuation
                    for (const result of results) {
                      assistantMessages.push(result.toolUseBlock);
                      toolMessages.push(result.toolResult);
                    }

                    console.log(
                      `[OpenAI Tool Handler] Executed ${results.length} tool calls, ${webSearchCount} web searches`
                    );

                    // Continue conversation with tool results
                    if (toolMessages.length > 0) {
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

                      if (response.ok && response.body) {
                        const stream = response.body.pipeThrough(new SSEParserTransform());
                        const reader = stream.getReader();
                        while (true) {
                          try {
                            const { value, done: streamDone } = await reader.read();
                            if (streamDone) break;
                            if (['message_start', 'message_stop'].includes(value.event)) continue;
                            if (!controller.desiredSize) break;
                            // Inject web_search_requests into continuation response's message_delta
                            if (value.event === 'message_delta') {
                              console.log(
                                `[WebSearch Debug] OpenAI cont message_delta: count=${webSearchCount}, hasUsage=${!!value.data?.usage}`
                              );
                              if (webSearchCount > 0) {
                                if (!value.data) value.data = {};
                                if (!value.data.usage) value.data.usage = {};
                                value.data.usage.server_tool_use = {
                                  ...(value.data.usage.server_tool_use || {}),
                                  web_search_requests: webSearchCount,
                                };
                                console.log(
                                  `[WebSearch] Injected web_search_requests: ${webSearchCount}`
                                );
                              }
                            }
                            controller.enqueue(value);
                          } catch (readError: any) {
                            if (
                              readError.name === 'AbortError' ||
                              readError.code === 'ERR_STREAM_PREMATURE_CLOSE'
                            ) {
                              abortController.abort();
                              break;
                            }
                            throw readError;
                          }
                        }
                      }

                      // Reset for potential next round
                      openAIProcessor.reset();
                      toolMessages.length = 0;
                      assistantMessages.length = 0;
                    }
                    return undefined;
                  }
                }

                // === Anthropic Format Tool Call Handling ===
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
                    // Track web search requests for usage reporting
                    if (currentToolName === 'WebSearch' || currentToolName === 'web_search') {
                      webSearchCount++;
                    }
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

                      // Inject web_search_requests into continuation response's message_delta
                      if (value.event === 'message_delta') {
                        console.log(
                          `[WebSearch Debug] Anthropic cont message_delta: count=${webSearchCount}, hasUsage=${!!value.data?.usage}`
                        );
                        if (webSearchCount > 0) {
                          if (!value.data) value.data = {};
                          if (!value.data.usage) value.data.usage = {};
                          value.data.usage.server_tool_use = {
                            ...(value.data.usage.server_tool_use || {}),
                            web_search_requests: webSearchCount,
                          };
                          console.log(
                            `[WebSearch] Final usage to client: ${JSON.stringify(value.data.usage)}`
                          );
                        }
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

                // Inject web_search_requests count into message_delta usage if we performed searches
                if (data.event === 'message_delta' && webSearchCount > 0) {
                  if (!data.data) data.data = {};
                  if (!data.data.usage) data.data.usage = {};
                  data.data.usage.server_tool_use = {
                    ...(data.data.usage.server_tool_use || {}),
                    web_search_requests: webSearchCount,
                  };
                  console.log(`[WebSearch] Original path injected: ${webSearchCount}`);
                }

                return data;
              } catch (error: any) {
                // Handle stream termination errors gracefully
                if (
                  error.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                  error.name === 'AbortError' ||
                  error.message === 'terminated' ||
                  error.type === 'terminated'
                ) {
                  console.error('Stream terminated:', error.message || error);
                  abortController.abort();
                  return undefined;
                }

                console.error('Unexpected error in stream processing:', error);
                // Return undefined instead of throwing to prevent crashing
                return undefined;
              }
            }).pipeThrough(new SSESerializerTransform())
          );
        }

        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // Process the value if needed
              const dataStr = new TextDecoder().decode(value);
              if (!dataStr.startsWith('event: message_delta')) {
                continue;
              }
              const str = dataStr.slice(27);
              try {
                const message = JSON.parse(str);
                sessionUsageCache.put(req.sessionId, message.usage);
              } catch {
                // Ignore JSON parse errors
              }
            }
          } catch (readError: any) {
            if (
              readError.name === 'AbortError' ||
              readError.code === 'ERR_STREAM_PREMATURE_CLOSE'
            ) {
              console.error('Background read stream closed prematurely');
            } else {
              console.error('Error in background stream reading:', readError);
            }
          } finally {
            reader.releaseLock();
          }
        };
        read(clonedStream);
        return done(null, originalStream);
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

  return server;
}

export { run };
// run();
