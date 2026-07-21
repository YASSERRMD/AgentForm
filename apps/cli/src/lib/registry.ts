import os from 'node:os';
import path from 'node:path';

/**
 * The local module/plugin registry root every command reads from and
 * `agentform` registry-publishing tooling writes to. Defaults to a
 * per-machine shared cache (`~/.agentform/registry`, the same "shared
 * store" convention npm/pnpm use for their own package caches) rather
 * than per-project — a published module is meant to be reused across
 * projects on the same machine, not re-published into every consumer.
 * `AGENTFORM_REGISTRY_ROOT` overrides it (e.g. for tests, or a
 * machine-wide registry mounted somewhere else).
 */
export function registryRootFor(): string {
  return process.env.AGENTFORM_REGISTRY_ROOT ?? path.join(os.homedir(), '.agentform', 'registry');
}

/** A trusted Ed25519 public key (PEM) module/plugin signatures are checked against, if configured — no default, since trusting a key is a decision the project/machine owner must make explicitly, not one this CLI can safely default to. */
export function trustedRegistryPublicKeyPem(): string | undefined {
  return process.env.AGENTFORM_REGISTRY_TRUSTED_KEY;
}
