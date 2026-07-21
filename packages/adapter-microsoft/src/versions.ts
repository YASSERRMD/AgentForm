/**
 * Exact, pinned dependency versions for the generated project (§21
 * "Generated dependency versions"). Verified by real `dotnet build` against
 * these exact `PackageReference` versions in a real `net10.0` console
 * project (not guessed from training data) — see the Phase 9 research
 * notes for the verified snippets this adapter's generation logic mirrors.
 */
export const MICROSOFT_AGENTS_AI_VERSION = '1.13.0';
export const MICROSOFT_AGENTS_AI_OPENAI_VERSION = '1.13.0';
export const MICROSOFT_AGENTS_AI_WORKFLOWS_VERSION = '1.13.0';
export const OPENAI_DOTNET_VERSION = '2.12.0';
/** `Microsoft.Agents.AI` 1.13.0 targets `net10.0` — verified via a real `dotnet build` against the installed net10.0 SDK. */
export const DOTNET_TARGET_FRAMEWORK = 'net10.0';
