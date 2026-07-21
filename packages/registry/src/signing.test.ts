import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair, signContentHash, verifyContentHashSignature } from './signing.js';

describe('signing', () => {
  it('generates a PEM-encoded Ed25519 key pair', () => {
    const pair = generateSigningKeyPair();
    expect(pair.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(pair.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('verifies a signature made with the matching private key', () => {
    const pair = generateSigningKeyPair();
    const signature = signContentHash('sha256:abc123', pair.privateKeyPem);
    expect(verifyContentHashSignature('sha256:abc123', signature, pair.publicKeyPem)).toBe(true);
  });

  it('rejects a signature verified against a different key pair', () => {
    const signer = generateSigningKeyPair();
    const other = generateSigningKeyPair();
    const signature = signContentHash('sha256:abc123', signer.privateKeyPem);
    expect(verifyContentHashSignature('sha256:abc123', signature, other.publicKeyPem)).toBe(false);
  });

  it('rejects a signature when the content hash was tampered with', () => {
    const pair = generateSigningKeyPair();
    const signature = signContentHash('sha256:abc123', pair.privateKeyPem);
    expect(verifyContentHashSignature('sha256:tampered', signature, pair.publicKeyPem)).toBe(false);
  });

  it('never throws on a malformed signature or key — returns false', () => {
    expect(verifyContentHashSignature('sha256:abc123', 'not-base64!!', 'not-a-key')).toBe(false);
  });
});
