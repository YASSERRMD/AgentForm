# ADR-0006: CLI command architecture

## Status

Accepted

## Context

Phase 5 (`temp/instruction.md` §15.1–15.5) implements the first five user-facing commands (`init`, `validate`, `format`, `inspect`, `graph`) on top of Phase 1's CLI shell and Phases 2–4's parser/schema/IR pipeline. Several concrete decisions weren't specified by the build spec and needed resolving: how commands share the parse-and-build pipeline, what exit code Commander's own usage errors produce versus what §14 requires, how starter templates handle real external dependencies, and how to make interactive prompting genuinely testable rather than an unverifiable stub.

## Decision

- **One shared pipeline helper (`lib/pipeline.ts`), not one per command.** `validate`, `inspect`, and `graph` all need `loadProject → buildIR` and differ only in what they do with the result. Duplicating that wiring three times would mean three places to keep in sync as the pipeline evolves (e.g., when Phase 6's policy engine adds a stage).
- **Commander's own usage-error exit codes are remapped.** Every Commander-internal usage error (`unknownOption`, `missingArgument`, `excessArguments`, `unknownCommand`, etc.) defaults to exit code `1` inside Commander itself, with no per-call way to override it. Agentform's exit-code contract (§14) reserves `1` for "general failure" and `2` specifically for "invalid command usage" — those are different things a script branching on exit code needs to tell apart. `lib/exit-codes.ts`'s `resolveCommanderExitCode()` inspects the `CommanderError`'s `code` string (verified against Commander 15's actual source, not guessed) and remaps the known usage-error codes to `2`, passing everything else (including `commander.help`/`commander.version`, already `0`) through unchanged.
- **`index.ts` uses `program.parseAsync()`, not `program.parse()`.** `init`'s interactive prompting makes its action `async`. Commander's `parse()` does not await async actions — using it here would let the process's synchronous flow (and the `try`/`catch` around it) complete before `init` finishes, and a _rejected_ action promise would surface as an unhandled promise rejection instead of hitting the CLI's own error handling. `parseAsync()` plus a top-level `await` in `index.ts` (valid in Node ESM) is what Commander itself recommends for a program with any async action.
- **Interactive prompting takes injectable I/O streams, in its own module (`lib/init-prompt.ts`).** Piped/spawned stdin is correctly _not_ a TTY (`process.stdin.isTTY` is falsy), so the interactive branch can never be driven through a spawned-subprocess e2e test — that's true of any CLI's interactive prompts, not a gap specific to this one. Extracting the prompting logic behind a `{ input: Readable, output: Writable }` parameter means it can be unit-tested directly against fake streams (`node:stream`'s `PassThrough`), proving the actual answer-parsing logic works, rather than trusting an untested code path gated behind a TTY check that tests can't satisfy.
- **Two of the five starter templates reference a real external API via `${env.*}` and will not pass `agentform validate` until that variable is set** (`human-approval`'s `REGISTRY_API_URL`, `government-complaint`'s `COMPLAINT_API_URL`). This was a deliberate choice, not an oversight: those templates model a workflow that genuinely calls an organization's own API, and hard-coding a fake placeholder URL that validates cleanly would be actively misleading (§3.5 "safe by default" — a write-capable HTTP tool shouldn't look "ready" before it's actually pointed anywhere real). Every template that _doesn't_ need an external API (`basic`, `tool-agent`, `multi-agent`) passes validation immediately with zero setup. Every template with a requirement declares it via `ProjectTemplate.requiredEnvVars`, which drives both the generated `.env.example` and a "Setup" section in the generated README — so the requirement is documented at generation time, not discovered only via a validation failure.
- **`inspect`'s resource-address resolution (`model.x`, `agent.y`, ...) and `graph`'s workflow selection both return structured "not found" results rather than throwing** — every command-level error path in this phase reports a diagnostic-shaped or plain message and sets an exit code, never lets an exception reach the top of `index.ts` for an expected failure (only genuinely unexpected errors should ever reach that generic handler).

## Alternatives considered

- **A third-party prompting library** (`@inquirer/prompts`, `prompts`, etc.) for `init`'s interactive mode: rejected — `node:readline/promises` (a Node built-in, stable since Node 17) covers the two-question prompt this phase actually needs without a new dependency; a richer prompting library is easy to introduce later if a future phase needs multi-select or validation-as-you-type, without this phase paying for it now.
- **Leaving Commander's default exit code 1 for usage errors**: rejected — §14 explicitly reserves distinct codes for "general failure" versus "invalid command usage"; conflating them would make exit-code-based scripting against `agentform` less reliable than the spec promises.
- **Templates that always validate cleanly** (hard-coding a fake API URL for `human-approval`/`government-complaint`): rejected — see Decision above; this would be a real instance of the "safe by default" principle being violated for the sake of a smoother first run.
- **Testing `init`'s interactive mode only via the TTY-detection branch** (accepting it as untested): rejected — extracting `promptForMissing` behind injectable streams was a small refactor that turned an unverifiable code path into five real unit tests (`init-prompt.test.ts`).

## Consequences

- Any future command that also needs `loadProject → buildIR` (e.g. a later `apply`/`drift` command) should use `lib/pipeline.ts`'s `loadAndBuildIR`, extending it if a new stage is needed, rather than re-wiring the pipeline inline.
- Any future command with an async action relies on `index.ts`'s `parseAsync()` already being in place — this doesn't need revisiting per-command.
- `resolveCommanderExitCode`'s usage-error code list was read directly from Commander 15's source rather than inferred from docs; it should be re-verified against Commander's source (not just its changelog) if the CLI ever upgrades across a major version, since Commander doesn't treat these internal code strings as a documented public API.

## Security impact

None beyond what `@agentform/parser`/`@agentform/schema`/`@agentform/ir` already established. `init`/`format` are the only filesystem-writing commands in this phase; both are scoped to exactly the files they're documented to touch (see `docs/cli-reference.md`'s Security implications section).

## Migration impact

None — these are the first CLI commands beyond the Phase 1 shell.
