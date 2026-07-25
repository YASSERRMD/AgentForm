import type {
  HealthResponse,
  PatchSpecResponse,
  ResourceFormSchema,
  ResourceType,
  SpecDocumentResponse,
  SpecPatch,
} from '@agentform/studio-core';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} responded with ${response.status}`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} responded with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health');
}

export function getSpec(): Promise<SpecDocumentResponse> {
  return getJson<SpecDocumentResponse>('/api/spec');
}

export function getFormSchemas(): Promise<Record<ResourceType, ResourceFormSchema>> {
  return getJson<Record<ResourceType, ResourceFormSchema>>('/api/form-schemas');
}

/**
 * `success: false` in the response is a real, expected outcome (the
 * patch failed validation or policy) — not an HTTP error, so it never
 * throws on that path. Only a genuinely malformed request (caught by
 * the server's own Zod body schema) or a transport failure throws.
 */
export function patchSpec(patch: SpecPatch): Promise<PatchSpecResponse> {
  return postJson<PatchSpecResponse>('/api/spec/patch', { patch });
}
