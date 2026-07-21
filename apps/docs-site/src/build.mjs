// Renders docs/**/*.md into a static HTML site under apps/docs-site/dist/.
// Deliberately not a full framework (VitePress/Docusaurus) — this monorepo
// has kept its tooling minimal since Phase 1 (see ADR-0001), and a plain
// markdown-to-HTML render with a shared nav is enough for "browsable site,"
// which is what §Phase 12's "complete documentation site" actually asks
// for. The page list below is an explicit manifest, not a directory glob —
// nav order and section grouping are curated, not incidental to file
// discovery order.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');
const OUT_DIR = path.join(__dirname, '../dist');

/** @typedef {{ title: string, file: string, slug: string }} Page */
/** @typedef {{ title: string, pages: Page[] }} Section */

function page(title, relativeFile) {
  const slug = relativeFile.replace(/\.md$/, '').replace(/\//g, '-');
  return { title, file: relativeFile, slug };
}

/** @type {Section[]} */
const SECTIONS = [
  {
    title: 'Getting Started',
    pages: [page('Getting Started', 'getting-started.md')],
  },
  {
    title: 'Guides',
    pages: [
      page('Architecture', 'architecture.md'),
      page('Environment Overlays', 'environment-overlays.md'),
      page('Import Guide', 'import-guide.md'),
      page('Migration Guide', 'migration-guide.md'),
      page('Troubleshooting', 'troubleshooting.md'),
      page('Plugin Development', 'plugin-development.md'),
      page('Policy Development', 'policy-development.md'),
      page('Adapter Guide', 'adapter-guide.md'),
      page('Release Process', 'release-process.md'),
    ],
  },
  {
    title: 'Reference',
    pages: [
      page('Specification Reference', 'schema-reference.md'),
      page('CLI Reference', 'cli-reference.md'),
      page('Parser Reference', 'parser-reference.md'),
      page('IR Reference', 'ir-reference.md'),
      page('Policy Reference', 'policy-reference.md'),
      page('State Reference', 'state-reference.md'),
      page('Planner Reference', 'planner-reference.md'),
      page('Compiler Reference', 'compiler-reference.md'),
      page('Evaluation Reference', 'evaluation-reference.md'),
      page('Registry Reference', 'registry-reference.md'),
    ],
  },
  {
    title: 'Security',
    pages: [page('Threat Model', 'security/threat-model.md')],
  },
  {
    title: 'Framework Tutorials',
    pages: [
      page('OpenAI Agents SDK', 'tutorials/openai.md'),
      page('LangGraph', 'tutorials/langgraph.md'),
      page('Microsoft Agent Framework', 'tutorials/microsoft.md'),
      page('Google ADK', 'tutorials/google-adk.md'),
      page('AutoGen', 'tutorials/autogen.md'),
      page('CrewAI', 'tutorials/crewai.md'),
    ],
  },
  {
    title: 'Examples',
    pages: [
      page('Government Workflow', 'examples/government-workflow.md'),
      page('Enterprise Customer Support', 'examples/enterprise-customer-support.md'),
      page('Regulated Approval', 'examples/regulated-approval.md'),
    ],
  },
  {
    title: 'Architecture Decision Records',
    pages: [
      page('0000 — Template', 'adr/0000-template.md'),
      page('0001 — Monorepo Architecture', 'adr/0001-monorepo-architecture.md'),
      page('0002 — TypeScript & Node Runtime', 'adr/0002-typescript-node-runtime.md'),
      page('0003 — Schema Versioning', 'adr/0003-schema-versioning.md'),
      page('0004 — Parser Architecture', 'adr/0004-parser-architecture.md'),
      page('0005 — IR & Semantic Validation', 'adr/0005-ir-and-semantic-validation.md'),
      page('0006 — CLI Command Architecture', 'adr/0006-cli-command-architecture.md'),
      page('0007 — Policy Engine Architecture', 'adr/0007-policy-engine-architecture.md'),
      page('0008 — State & Planner Architecture', 'adr/0008-state-and-planner-architecture.md'),
      page(
        '0009 — Compiler & Adapter Architecture',
        'adr/0009-compiler-and-adapter-architecture.md',
      ),
      page('0010 — Phase 9 Adapter Architecture', 'adr/0010-phase9-adapter-architecture.md'),
      page('0011 — Evaluation Architecture', 'adr/0011-evaluation-architecture.md'),
      page('0012 — Apply & Drift Architecture', 'adr/0012-apply-and-drift-architecture.md'),
      page('0013 — Rollback & Destroy Behavior', 'adr/0013-rollback-and-destroy-behavior.md'),
      page('0014 — Module Registry Architecture', 'adr/0014-module-registry-architecture.md'),
    ],
  },
];

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderNav(activeSlug) {
  return SECTIONS.map((section) => {
    const items = section.pages
      .map((p) => {
        const href = `${p.slug}.html`;
        const active = p.slug === activeSlug ? ' class="active"' : '';
        return `<li><a href="${href}"${active}>${escapeHtml(p.title)}</a></li>`;
      })
      .join('\n');
    return `<div class="nav-section"><h3>${escapeHtml(section.title)}</h3><ul>${items}</ul></div>`;
  }).join('\n');
}

const STYLE = `
:root { color-scheme: light dark; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; display: flex; min-height: 100vh; }
nav { width: 280px; flex-shrink: 0; padding: 1.5rem; border-right: 1px solid #8884; overflow-y: auto; position: sticky; top: 0; height: 100vh; }
nav h1 { font-size: 1.1rem; margin: 0 0 1rem; }
nav h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; margin: 1.25rem 0 0.4rem; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav li a { display: block; padding: 0.2rem 0; text-decoration: none; color: inherit; opacity: 0.85; font-size: 0.92rem; }
nav li a:hover { opacity: 1; text-decoration: underline; }
nav li a.active { font-weight: 600; opacity: 1; }
main { flex: 1; max-width: 860px; padding: 2rem 3rem 6rem; }
main :first-child { margin-top: 0; }
pre { background: #8881; padding: 1rem; border-radius: 6px; overflow-x: auto; }
code { background: #8882; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #8884; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
a { color: #3b82f6; }
`;

function renderPage(p, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(p.title)} — Agentform Docs</title>
<style>${STYLE}</style>
</head>
<body>
<nav><h1>Agentform Docs</h1>${renderNav(p.slug)}</nav>
<main>${bodyHtml}</main>
</body>
</html>
`;
}

function build() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  let missing = 0;
  for (const section of SECTIONS) {
    for (const p of section.pages) {
      const sourcePath = path.join(DOCS_ROOT, p.file);
      let markdown;
      try {
        markdown = readFileSync(sourcePath, 'utf-8');
      } catch {
        console.warn(`skip (not found): ${p.file}`);
        missing += 1;
        continue;
      }
      const bodyHtml = marked.parse(markdown);
      writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), renderPage(p, bodyHtml), 'utf-8');
      written += 1;
    }
  }

  const indexPage = SECTIONS[0].pages[0];
  writeFileSync(
    path.join(OUT_DIR, 'index.html'),
    `<!doctype html><meta http-equiv="refresh" content="0; url=${indexPage.slug}.html" />`,
    'utf-8',
  );

  console.log(`Wrote ${written} page(s) to ${path.relative(REPO_ROOT, OUT_DIR)}/`);
  if (missing > 0) {
    console.error(`${missing} page(s) in the manifest had no corresponding docs/ file.`);
    process.exitCode = 1;
  }
}

build();
