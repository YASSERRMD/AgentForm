/**
 * Exact, pinned dependency version for the generated project (§21
 * "Generated dependency versions"). Verified against the real installed
 * `agno` package (`importlib.metadata.metadata('agno')` in a real
 * virtualenv), not guessed from training data.
 */
export const AGNO_VERSION = '2.8.0';
/** Verified from the installed package's own METADATA (`Requires-Python: <4,>=3.9`) via `importlib.metadata.metadata('agno')`. */
export const PYTHON_VERSION_REQUIREMENT = '>=3.9,<4';
/**
 * `agno.workflow`'s own `__init__.py` unconditionally imports
 * `RemoteWorkflow` (`from agno.workflow.remote import RemoteWorkflow`,
 * no try/except), which requires `fastapi` — verified directly: `import
 * agno.workflow` raises `ModuleNotFoundError: No module named 'fastapi'`
 * against a fresh `pip install agno` with no extras. `agno`'s own package
 * metadata marks `fastapi` as belonging to the `os`/`dev`/`demo` extras
 * (optional), but the workflow module's real, observed import behavior
 * doesn't honor that — so this adapter pins `fastapi` as a direct
 * dependency of every generated project rather than assuming it comes
 * along for free, regardless of what `agno`'s own extras metadata claims.
 */
export const FASTAPI_VERSION = '0.139.2';
