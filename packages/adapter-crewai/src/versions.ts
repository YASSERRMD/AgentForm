/**
 * Exact, pinned dependency version for the generated project (§21
 * "Generated dependency versions"). Verified against the real installed
 * `crewai` package (`pip show crewai`, `importlib.metadata.version`) in a
 * real virtualenv, not guessed from training data.
 */
export const CREWAI_VERSION = '1.15.5';
/** Verified from the installed package's own METADATA (`Requires-Python: <3.14,>=3.10`) via `importlib.metadata.metadata('crewai')`. */
export const PYTHON_VERSION_REQUIREMENT = '>=3.10,<3.14';
