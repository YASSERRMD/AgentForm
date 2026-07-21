# @agentform/benchmarks

A timing harness for Agentform's four core pipeline stages — parse (`@agentform/parser`'s `loadProject`), validate (`@agentform/ir`'s `buildIR` plus `@agentform/policy`'s `evaluatePolicies`, matching what `agentform validate` actually runs), plan (`@agentform/planner`'s `comparePlan`, against an empty current-state baseline — the first-apply case), and compile (`@agentform/compiler`'s `compile`, against the OpenAI adapter) — run against synthetic projects of three sizes (`src/generate-project.mjs`: 5, 25, and 100 agents, each with one tool and chained into a single linear workflow, staying well under `@agentform/ir`'s 200-node/500-edge structural caps even at the largest tier).

## Running

```
pnpm build          # packages must be built first — this reads dist/ output, like apps/docs-site
pnpm benchmark       # prints a table per size; add --save-baseline to overwrite baseline.json
```

Each stage runs 5 warmup iterations (discarded) followed by 25 measured iterations, reporting min/max/mean/median wall-clock time in milliseconds (`process.hrtime.bigint()`).

## Interpreting results

`baseline.json` is a snapshot from one real run on one machine — useful as a relative reference point ("did this change make things meaningfully slower") when re-run on the same machine, not as an absolute performance guarantee. Timing numbers are inherently sensitive to hardware, other load on the machine, and Node/V8 version; nothing in this package enforces a regression threshold or fails CI on a slowdown — that would need a controlled, dedicated benchmarking environment to be meaningful rather than noisy.

One characteristic worth noting from the recorded baseline: **parse dominates the other three stages by roughly an order of magnitude at every size.** Validate, plan, and compile are all sub-millisecond even at 100 agents; parsing (YAML parsing, `$ref`/overlay/variable resolution, auto-discovery) is the most expensive stage measured. This isn't a defect — parsing does meaningfully more work (real string scanning and tree construction) than the other three stages, which mostly walk an already-built in-memory structure — but it's the right place to look first if a future project size makes the pipeline noticeably slow.

## Regenerating the baseline

Run `pnpm benchmark -- --save-baseline` (or `node src/run.mjs --save-baseline` from this directory) after a change that might affect pipeline performance, and review the diff in `baseline.json` before committing it — like any golden file, an unreviewed update defeats its purpose as a reference point.
