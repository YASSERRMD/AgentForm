import type {
  AuditListResponse,
  ChatHistoryMessage,
  ChatSpecResponse,
  HealthResponse,
  PatchSpecResponse,
  ResourceFormSchema,
  ResourceType,
  SpecDocumentResponse,
  SpecPatch,
} from '@agentform/studio-core';
import type {
  ChatDesignResponse,
  DesignDraft,
  DesignResourceType,
  GetDesignResponse,
  PutDesignResponse,
} from '@agentform/studio-design';
import { getStoredStudioToken } from './auth-token.js';

/** Omits the header entirely when no token was ever bootstrapped — Studio's zero-config default (no `AGENTFORM_STUDIO_TOKEN` set) sends exactly the same request shape as before this existed. */
function authHeaders(): HeadersInit {
  const token = getStoredStudioToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A 401 specifically means "missing or wrong Studio access token" (ADR-0022), distinguishable from every other failure so a caller's `.catch(...)` can surface something actionable rather than a generic "responded with 401". */
function throwForResponse(path: string, response: Response): never {
  if (response.status === 401) {
    throw new Error(
      `${path} requires a Studio access token — open Studio using the URL printed at startup, or set one via AGENTFORM_STUDIO_TOKEN.`,
    );
  }
  throw new Error(`${path} responded with ${response.status}`);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: authHeaders() });
  if (!response.ok) {
    throwForResponse(path, response);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throwForResponse(path, response);
  }
  return (await response.json()) as T;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throwForResponse(path, response);
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

export function getDesign(
  resourceType: DesignResourceType,
  resourceId: string,
): Promise<GetDesignResponse> {
  return getJson<GetDesignResponse>(
    `/api/design/${resourceType}/${encodeURIComponent(resourceId)}`,
  );
}

/** `success: false` is a real, expected outcome (a dangling binding, a shape mismatch) — not an HTTP error. Only a malformed request or a transport failure throws. */
export function putDesign(
  resourceType: DesignResourceType,
  resourceId: string,
  design: DesignDraft,
): Promise<PutDesignResponse> {
  return putJson<PutDesignResponse>(
    `/api/design/${resourceType}/${encodeURIComponent(resourceId)}`,
    {
      design,
    },
  );
}

/**
 * Preview-only: never writes anything itself. `success: false` is a real
 * outcome (no provider configured, generation failed, or a proposed
 * patch failed validation) — not an HTTP error. Accepting a proposal
 * means re-submitting `patch` to the real `patchSpec` above, not calling
 * anything special here. `history` is prior turns, oldest first; omit
 * for the first turn of a conversation.
 */
export function chatSpec(
  message: string,
  history?: readonly ChatHistoryMessage[],
): Promise<ChatSpecResponse> {
  return postJson<ChatSpecResponse>('/api/genai/chat/spec', { message, history });
}

/** Preview-only, same contract as `chatSpec`. Accepting a proposal means loading `design.layout` into the layout editor's own draft state, not calling anything special here — the editor's existing "Save layout" is still the only thing that persists it. */
export function chatDesign(
  agentId: string,
  message: string,
  history?: readonly ChatHistoryMessage[],
): Promise<ChatDesignResponse> {
  return postJson<ChatDesignResponse>('/api/genai/chat/design', { agentId, message, history });
}

/** Local, append-only provenance log — newest first, capped server-side. Never empty-vs-error: no entries yet is a normal `{entries: []}`, same as every other Studio read endpoint. */
export function getAudit(): Promise<AuditListResponse> {
  return getJson<AuditListResponse>('/api/audit');
}
