# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a suspected security vulnerability.

Instead, report it privately using [GitHub's private vulnerability reporting](https://github.com/YASSERRMD/AgentForm/security/advisories/new) for this repository, or by emailing **arafath.yasser@gmail.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof of concept
- The affected version/commit

You should receive an acknowledgement within a few business days. Please allow a reasonable window for a fix before any public disclosure.

## Supported versions

Agentform is pre-1.0 and under active phased development (see [`README.md`](README.md#project-status)). Until a `v1.0.0` release, only the latest commit on `main` is supported — there is no maintained release branch yet.

## Security posture (current phase)

This is a general note, not the full threat model — a dedicated threat model document is planned as part of the policy-engine phase (see `temp/instruction.md`, §19 and Phase 6).

At this phase, the repository contains only build tooling, a CLI shell with no subcommands, and empty package skeletons — there is no specification parser, expression evaluator, plugin loader, or code generator running yet, so most Agentform-specific attack surface (malicious specification files, prompt/tool injection, unsafe YAML, plugin trust, generated-code tampering) does not yet exist in this codebase. As those land in later phases, this document will be expanded alongside them. Standing principles that already apply:

- Dependencies are pinned via the committed lockfile (`pnpm-lock.yaml`); dependency and secret scanning are expected in CI as the codebase grows.
- No secret values are ever committed; `.env*` files are gitignored except `.env.example`.
- CI runs against the exact commands documented in `README.md`, so security-relevant regressions are caught the same way functional ones are.
