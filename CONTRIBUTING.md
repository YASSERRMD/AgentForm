# Contributing to Agentform

Agentform is built in phases, each on its own branch and pull request. This document covers the mechanics of contributing during that phased build; see [`README.md`](README.md) for the project vision and [`temp/instruction.md`](temp/instruction.md) for the full phase-by-phase plan.

## Development setup

Requirements: Node.js ≥ 22, [pnpm](https://pnpm.io) 10 (enable via `corepack enable` or install directly).

```bash
git clone https://github.com/YASSERRMD/AgentForm.git
cd AgentForm
pnpm install
pnpm build
pnpm test
```

## Branching and commits

- Never commit directly to `main`. Every change lands on a phase branch (`phase_N`) or, for a post-merge correction, a fix branch (`phase_N_fixM`).
- Branch from a freshly pulled `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message (`feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`, `test(scope): ...`, `refactor(scope): ...`, `ci(scope): ...`). Avoid vague messages like `update code` or `wip`.
- Keep commits atomic and independently understandable. Don't mix unrelated refactoring into a feature commit.
- Don't commit secrets, `.env` files, or generated/temporary artifacts (`dist/`, `.turbo/`, `coverage/`, `.agentform/`).

## Pull requests

Every pull request must include:

- Summary
- Scope
- Architecture decisions
- Major files added
- Tests added
- Known limitations
- Security considerations
- Migration implications
- Follow-up work
- Exact verification commands

Pull requests are merged **without squashing** (`--no-ff`), preserving full commit history, and only once CI (lint, typecheck, test, build) is green.

## Code style

- Strict TypeScript, ESM only, no `any` outside a documented compatibility boundary, no unsafe type assertions.
- Prefer pure functions for parsing, normalization, and planning; use dependency injection for state, filesystem, adapters, and time so they stay testable.
- Preserve source locations and return structured diagnostics rather than throwing raw errors, once diagnostics exist (Phase 2+).
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening a PR — CI runs the same commands.
- Don't leave `TODO`/`FIXME` markers, skipped/focused tests, or debug logs in a change you're presenting as complete.

## Reporting issues

Open a GitHub issue with reproduction steps. For security vulnerabilities, follow [`SECURITY.md`](SECURITY.md) instead of filing a public issue.
