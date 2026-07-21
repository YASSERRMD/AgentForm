import { generateKeyPairSync, sign, verify } from 'node:crypto';

export interface SigningKeyPair {
  /** PEM-encoded Ed25519 private key — never published, kept by whoever runs `publishModule`/`publishPluginEntry`. */
  readonly privateKeyPem: string;
  /** PEM-encoded Ed25519 public key — published alongside a module/plugin so a consumer can verify it. */
  readonly publicKeyPem: string;
}

/**
 * Generates a fresh Ed25519 key pair for signing module/plugin registry
 * metadata (§Phase 12 "signed module metadata"/"plugin registry
 * metadata"). Ed25519 via Node's built-in `crypto` needs no new
 * dependency and is the modern, fast, small-signature default for this
 * kind of "sign a manifest so tampering is detectable" use case — there
 * is no need for RSA's larger keys/signatures or configurable curves
 * here.
 */
export function generateSigningKeyPair(): SigningKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** Signs `contentHash` (a hex/base64 content hash string, never the raw content itself — see `moduleContentHash`) with a PEM-encoded Ed25519 private key, returning a base64 signature. */
export function signContentHash(contentHash: string, privateKeyPem: string): string {
  return sign(null, Buffer.from(contentHash, 'utf-8'), privateKeyPem).toString('base64');
}

/** Verifies a base64 signature (from `signContentHash`) against `contentHash` and a PEM-encoded Ed25519 public key. Never throws on a malformed key/signature — an unverifiable signature is just `false`, the same way a wrong one is. */
export function verifyContentHashSignature(
  contentHash: string,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    return verify(
      null,
      Buffer.from(contentHash, 'utf-8'),
      publicKeyPem,
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}
