# Agentform Studio

Agentform Studio is a local web GUI layered on top of the existing Agentform core — a second, visual interface onto the same `agentform.yaml` spec the CLI already reads, edits, and compiles. It never replaces the CLI, the compiler, or the IR, and it never becomes a second source of truth: the specification file stays authoritative, and Studio is a view and editor over it. See [ADR-0016](adr/0016-agentform-studio-foundation.md) (foundation) and [ADR-0017](adr/0017-schema-driven-form-builder.md) (forms + the write path) for the architecture decisions behind this.

This document covers what exists today. Studio is delivered across several phases (see the roadmap below); this page will grow with each one.

## What exists today (Phases 13–14)

- A view of one project's spec: metadata, and every model/agent/tool/workflow, listed by id.
- Live diagnostics from the same schema/semantic validation pipeline `agentform validate` uses — an invalid spec renders its diagnostics instead of a spec view, exactly as it would in the CLI.
- Click any resource id to open a real, schema-driven edit form; each section has an inline "add new" field too. Saving sends a patch to the server, which re-runs the _entire_ validate → policy pipeline before writing anything — a rejected edit shows the real diagnostics inline, and nothing is written to disk.
- The write is a real, lossless YAML round trip: comments, key order, and formatting survive untouched everywhere the edit didn't touch.
- Only single-file projects are editable today — a project that auto-discovers resources from `agents/`/`tools/`/`workflows/` directories, or that uses `$ref`, can still be _viewed_, but a save is refused with a clear error rather than guessed at.
- Still no canvas, no chat, no GenAI. Those arrive in Phases 15–18.

## Running it locally

Studio is two separate local processes — a backend and a frontend — neither of which is wired into the `agentform` CLI yet (that's a later phase). Run each from the repo root:

```bash
# Backend — serves one project directory over HTTP on 127.0.0.1:4310
AGENTFORM_STUDIO_ROOT=/path/to/your/project pnpm --filter @agentform/studio-server dev

# Frontend — Vite dev server on 127.0.0.1:5173, proxies /api/* to the backend above
pnpm --filter @agentform/studio-web dev
```

Or start both together from the repo root:

```bash
pnpm dev
```

Then open `http://localhost:5173`. `AGENTFORM_STUDIO_ROOT` defaults to the backend process's current working directory if unset; point it at any directory containing an `agentform.yaml`/`agentform.yml`/`agentform.json`, including any of the projects under `examples/`.

## Configuration

| Variable                      | Default                 | Meaning                                                                                                                                                                                                                                                                    |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTFORM_STUDIO_ROOT`       | `process.cwd()`         | The project directory `studio-server` serves. One project per process — the same model as the CLI's `--cwd`, not multi-tenant.                                                                                                                                             |
| `AGENTFORM_STUDIO_PORT`       | `4310`                  | The backend's listen port.                                                                                                                                                                                                                                                 |
| `AGENTFORM_STUDIO_DEV_ORIGIN` | `http://localhost:5173` | The single CORS-allowed origin (Vite's own default dev port). `studio-server` has no authentication by design — see ADR-0016's security impact section — so this is the one layer stopping an arbitrary webpage from reading your spec over an unauthenticated local port. |

## What's explicitly not here yet

- No canvas — the workflow-graph editor is Phase 15; the form-layout and design layers are Phase 16.
- No GenAI — prompt-to-spec and prompt-to-design generation is Phase 17; edit-by-chat is Phase 18.
- No multi-file write support — a project whose resources are split across multiple files (directory auto-discovery, `$ref`) can be viewed but not saved from Studio yet.
- No `agentform studio` CLI subcommand — both processes are started directly via `pnpm --filter`, as shown above.
- No authentication or multi-project support — see ADR-0016.

## Roadmap

| Phase         | Delivers                                        |
| ------------- | ----------------------------------------------- |
| 13            | Studio foundation: read-only spec + diagnostics |
| 14 (this one) | Schema-driven spec form builder                 |
| 15            | Canvas: workflow graph editor                   |
| 16            | Canvas: form layout + design layer              |
| 17            | GenAI: prompt → spec, prompt → design           |
| 18            | Edit-by-chat, unified proposal/review pipeline  |
