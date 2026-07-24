import type { HealthResponse, SpecDocumentResponse } from '@agentform/studio-core';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
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
