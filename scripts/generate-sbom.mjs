// Generates a CycloneDX-shaped software bill of materials from pnpm's own
// dependency graph (`pnpm list --recursive --json --depth Infinity`) —
// deliberately not a new external SBOM tool dependency: pnpm already knows
// the real resolved graph, and turning its own JSON output into CycloneDX's
// component shape is a small, honest transform rather than trusting a
// third-party generator's npm/lockfile assumptions (most assume a
// package-lock.json this workspace doesn't have).
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CYCLONEDX_SPEC_VERSION = '1.5';

function purlFor(name, version) {
  const encodedName = name.startsWith('@') ? name.replace('/', '%2F') : name;
  return `pkg:npm/${encodedName}@${version}`;
}

function collectComponents(projects) {
  const components = new Map();

  function visit(name, dep) {
    const isWorkspaceLink = typeof dep.version === 'string' && dep.version.startsWith('link:');
    const key = `${name}@${dep.version}`;
    if (!components.has(key)) {
      components.set(key, {
        type: isWorkspaceLink ? 'application' : 'library',
        name,
        version: dep.version,
        scope: isWorkspaceLink ? 'workspace-internal' : undefined,
        purl: isWorkspaceLink ? undefined : purlFor(name, dep.version),
      });
    }
    for (const [childName, childDep] of Object.entries(dep.dependencies ?? {})) {
      visit(childName, childDep);
    }
  }

  for (const project of projects) {
    components.set(`${project.name}@${project.version}`, {
      type: 'application',
      name: project.name,
      version: project.version,
      scope: 'workspace-root',
    });
    for (const [name, dep] of Object.entries(project.dependencies ?? {})) {
      visit(name, dep);
    }
  }

  return [...components.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const raw = execFileSync(
    'pnpm',
    ['list', '--recursive', '--json', '--depth', 'Infinity', '--prod'],
    { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  const projects = JSON.parse(raw);
  const components = collectComponents(projects);

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: CYCLONEDX_SPEC_VERSION,
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: 'application', name: 'agentform-monorepo', version: '0.1.0' },
    },
    components,
  };

  const outPath = path.join(REPO_ROOT, 'sbom.json');
  writeFileSync(outPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf-8');
  console.log(
    `Wrote ${path.relative(REPO_ROOT, outPath)} with ${components.length} components (production dependencies only, ${projects.length} workspace projects).`,
  );
}

main();
