import { FastifyRequest, FastifyReply } from 'fastify';

export const apiKeyAuth =
  (config: any) => async (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Configure CORS for allowed origins
    const allowedOrigins = [
      `http://127.0.0.1:${config.PORT || 3456}`,
      `http://localhost:${config.PORT || 3456}`,
    ];

    // Add ingress host if configured
    if (config.INGRESS_HOST) {
      allowedOrigins.push(config.INGRESS_HOST);
    }

    if (req.headers.origin && allowedOrigins.includes(req.headers.origin)) {
      reply.header('Access-Control-Allow-Origin', req.headers.origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    done();
  };

// Auth function to forward user's API key to backend
export async function forwardAuthHeader(requestBody: any, provider: any, context: any) {
  const req = context.req;
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader) {
    return {
      body: requestBody,
      config: {
        headers: {
          Authorization: authHeader,
        },
      },
    };
  }

  return requestBody;
}
