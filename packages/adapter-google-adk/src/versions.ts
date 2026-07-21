/**
 * Exact, pinned dependency version for the generated project (§21
 * "Generated dependency versions"). Verified against the real `google-adk`
 * package — installed in a real virtualenv and inspected directly
 * (`inspect.signature` against the real `LlmAgent`/`Runner`/session APIs,
 * and real scripts actually run against them, including a full
 * `Runner.run_async` event stream against a fake model) — not guessed from
 * training data.
 */
export const GOOGLE_ADK_VERSION = '2.5.0';
/** Verified from the installed package's own METADATA (`Requires-Python: >=3.10`). */
export const PYTHON_VERSION_REQUIREMENT = '>=3.10';
