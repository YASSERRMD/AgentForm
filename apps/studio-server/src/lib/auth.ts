import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

const BEARER_PREFIX = 'Bearer ';
const TOKEN_QUERY_PARAM = 'token';

/**
 * `Authorization: Bearer <token>` is the primary mechanism, for every
 * ongoing API call. `?token=` is a bootstrap-only fallback for a
 * browser's first navigation (e.g. Studio's own startup log prints a
 * ready-to-open URL carrying it) — never rely on it beyond that first
 * load, since Fastify's `logger: true` logs request URLs including
 * query strings, and a token present in every request's URL would leak
 * into the server's own log output.
 */
export function extractBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith(BEARER_PREFIX)) {
    return header.slice(BEARER_PREFIX.length);
  }
  const query = request.query as Record<string, unknown> | undefined;
  const queryToken = query?.[TOKEN_QUERY_PARAM];
  return typeof queryToken === 'string' ? queryToken : undefined;
}

/**
 * `timingSafeEqual` throws on a length mismatch rather than returning
 * `false` — guard explicitly so a length difference can't itself become
 * a timing side-channel (an early, variable-cost `throw` before the
 * constant-time comparison would leak exactly what a naive `===` does).
 */
export function tokensMatch(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * An `onRequest` hook gating every route with no exemptions — including
 * `GET /api/health`, which otherwise leaks `rootDir` (an absolute
 * filesystem path). Must be registered *after* `@fastify/cors` (see
 * app.ts): a CORS preflight (`OPTIONS`, carries no `Authorization`
 * header by browser design) is fully resolved by CORS's own
 * earlier-registered hook and never reaches this one; a real
 * GET/POST/PUT passes through both in registration order.
 */
export function createAuthHook(
  expectedToken: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const provided = extractBearerToken(request);
    if (!tokensMatch(provided, expectedToken)) {
      await reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message:
          'Missing or invalid Studio access token. Pass it as an `Authorization: Bearer <token>` header, or `?token=<token>` on your first request.',
      });
    }
  };
}
