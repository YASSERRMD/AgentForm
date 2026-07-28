import type { FileSystem } from '@agentform/parser';
import type { GenAIProvider } from '@agentform/studio-genai';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createAuthHook } from './lib/auth.js';
import type { FileWriter } from './lib/file-writer.js';
import type { GenAIRateLimitConfig } from './lib/rate-limit-config.js';
import { registerAuditRoute } from './routes/audit.js';
import { registerChatRoute } from './routes/chat.js';
import { registerDesignRoute } from './routes/design.js';
import { registerFormSchemasRoute } from './routes/form-schemas.js';
import { registerGenaiRoute } from './routes/genai.js';
import { registerHealthRoute } from './routes/health.js';
import { registerPatchSpecRoute } from './routes/patch.js';
import { registerSpecRoute } from './routes/spec.js';

/** Fastify v5's own implicit default — made explicit now that the `.max()` bounds on Studio's request schemas are load-bearing alongside it, not incidental. */
const BODY_LIMIT_BYTES = 1_048_576;

export interface BuildAppOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
  /** The single allowed CORS origin. Omit to disable CORS entirely (tests never need it — `.inject()` has no browser origin). */
  readonly devOrigin?: string;
  /** Omit to leave the GenAI routes unconfigured (they still exist, always responding `success: false`) — see routes/genai.ts. */
  readonly genaiProvider?: GenAIProvider;
  /**
   * Omit to run with no auth at all (the zero-config default — every
   * existing test omits this, so behavior is unchanged). When set, every
   * route on this server — including `GET /api/health`, no exceptions —
   * requires a matching bearer token. See lib/auth.ts and ADR-0022.
   */
  readonly authToken?: string;
  /** Omit to leave the 4 GenAI/chat routes unlimited (every existing genai.test.ts/chat.test.ts call omits this, so behavior is unchanged). See lib/rate-limit-config.ts and ADR-0022. */
  readonly genaiRateLimit?: GenAIRateLimitConfig;
}

/**
 * Builds (but does not `.listen()`) the Studio server. Tests call this
 * directly and exercise it via Fastify's `.inject()`, so no test ever
 * binds a real port.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: BODY_LIMIT_BYTES });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  if (options.devOrigin) {
    // Narrow allowlist, not `origin: true`/`*` — one of two cheap layers
    // (alongside the opt-in bearer token below) stopping an arbitrary
    // webpage the developer has open in the same browser from reaching
    // this server; see docs/security/threat-model.md and ADR-0022.
    void app.register(cors, { origin: [options.devOrigin] });
  }

  if (options.authToken) {
    // Registered *after* CORS, deliberately — see lib/auth.ts's doc
    // comment and ADR-0022 for why this ordering is load-bearing, not
    // incidental.
    app.addHook('onRequest', createAuthHook(options.authToken));
  }

  if (options.genaiRateLimit) {
    // `global: false`: registering this plugin doesn't limit anything by
    // itself — only the 4 GenAI/chat routes that explicitly opt in via
    // `config: { rateLimit }` (see routes/genai.ts, routes/chat.ts) are
    // ever throttled.
    void app.register(rateLimit, { global: false });
  }

  registerHealthRoute(app, { rootDir: options.rootDir });
  registerSpecRoute(app, { rootDir: options.rootDir, fs: options.fs });
  registerPatchSpecRoute(app, {
    rootDir: options.rootDir,
    fs: options.fs,
    fileWriter: options.fileWriter,
  });
  registerFormSchemasRoute(app);
  registerDesignRoute(app, {
    rootDir: options.rootDir,
    fs: options.fs,
    fileWriter: options.fileWriter,
  });

  // `@fastify/rate-limit` captures each route's `config.rateLimit` via its
  // own `onRoute` hook, which only applies to routes registered *after*
  // that hook is actually installed — not merely after `register()` is
  // *called*. `register()`'s plugin body runs on Avvio's own schedule,
  // not synchronously at the call site, so a route added immediately
  // afterward (in the same synchronous tick) can run before the hook
  // exists and silently never get limited. `app.after()` defers these two
  // registrations until every plugin queued so far (rate-limit included)
  // has actually finished loading, while keeping `buildApp` itself fully
  // synchronous — verified directly, not assumed: an earlier version of
  // this code registered these routes immediately and their rate limit
  // silently never engaged.
  app.after(() => {
    registerGenaiRoute(app, {
      rootDir: options.rootDir,
      fs: options.fs,
      provider: options.genaiProvider,
      rateLimit: options.genaiRateLimit,
    });
    registerChatRoute(app, {
      rootDir: options.rootDir,
      fs: options.fs,
      provider: options.genaiProvider,
      rateLimit: options.genaiRateLimit,
    });
  });

  registerAuditRoute(app, { rootDir: options.rootDir, fs: options.fs });

  return app;
}
