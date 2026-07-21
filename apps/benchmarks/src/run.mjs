// Timing harness for the four pipeline stages the build spec names
// (parse, validate, plan, compile), run against synthetic projects of
// three representative sizes. Requires every workspace package this
// imports to already be built (`pnpm build`, or `turbo run build`) —
// like apps/docs-site's build.mjs, this is a plain script, not something
// that goes through its own compile step, so it reads dist/ output
// directly rather than TypeScript source.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAiAdapter } from '@agentform/adapter-openai';
import { compile } from '@agentform/compiler';
import { buildIR } from '@agentform/ir';
import { createInMemoryFileSystem, loadProject } from '@agentform/parser';
import { comparePlan } from '@agentform/planner';
import { BUILTIN_POLICIES, evaluatePolicies } from '@agentform/policy';
import { BENCHMARK_SIZES, buildSyntheticProject } from './generate-project.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WARMUP_ITERATIONS = 5;
const MEASURED_ITERATIONS = 25;
const ROOT_DIR = path.resolve('/agentform-benchmark-project');

async function measure(fn) {
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    await fn();
  }
  const samplesMs = [];
  for (let i = 0; i < MEASURED_ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    samplesMs.push(Number(end - start) / 1_000_000);
  }
  samplesMs.sort((a, b) => a - b);
  const sum = samplesMs.reduce((total, ms) => total + ms, 0);
  return {
    iterations: MEASURED_ITERATIONS,
    minMs: samplesMs[0],
    maxMs: samplesMs[samplesMs.length - 1],
    meanMs: sum / samplesMs.length,
    medianMs: samplesMs[Math.floor(samplesMs.length / 2)],
  };
}

function formatMs(ms) {
  return ms.toFixed(3);
}

async function benchmarkSize({ name, agentCount }) {
  const document = buildSyntheticProject(agentCount);
  const fs = createInMemoryFileSystem({
    [path.join(ROOT_DIR, 'agentform.yaml')]: JSON.stringify(document),
  });

  const stages = {};

  stages.parse = await measure(() => loadProject({ rootDir: ROOT_DIR, fs }));

  const parsed = loadProject({ rootDir: ROOT_DIR, fs });
  if (parsed.diagnostics.some((d) => d.severity === 'error')) {
    throw new Error(
      `Synthetic project (${name}) failed to parse: ${JSON.stringify(parsed.diagnostics)}`,
    );
  }

  stages.validate = await measure(() => {
    const irResult = buildIR(parsed.value, { sourceMap: parsed.sourceMap });
    if (!irResult.application) {
      throw new Error(`Synthetic project (${name}) failed schema/semantic validation`);
    }
    evaluatePolicies(BUILTIN_POLICIES, { application: irResult.application });
  });

  const irResult = buildIR(parsed.value, { sourceMap: parsed.sourceMap });
  if (!irResult.ir) {
    throw new Error(
      `Synthetic project (${name}) produced no IR: ${JSON.stringify(irResult.diagnostics)}`,
    );
  }
  const ir = irResult.ir;

  stages.plan = await measure(() => comparePlan({ ir, currentResourceStates: [] }));

  stages.compile = await measure(() =>
    compile(ir, openAiAdapter, {
      outputDir: '/agentform-benchmark-project/generated/openai',
      agentformVersion: '0.1.0',
    }),
  );

  return { name, agentCount, stages };
}

async function main() {
  const saveBaseline = process.argv.includes('--save-baseline');
  const results = [];

  for (const size of BENCHMARK_SIZES) {
    process.stdout.write(`Running ${size.name} (${size.agentCount} agents)...\n`);
    results.push(await benchmarkSize(size));
  }

  const columnOrder = ['parse', 'validate', 'plan', 'compile'];
  process.stdout.write('\n');
  for (const result of results) {
    process.stdout.write(
      `## ${result.name} (${result.agentCount} agents, ${MEASURED_ITERATIONS} iterations)\n\n`,
    );
    process.stdout.write('stage    | mean (ms) | median (ms) | min (ms) | max (ms)\n');
    process.stdout.write('-------- | --------- | ----------- | -------- | --------\n');
    for (const stageName of columnOrder) {
      const s = result.stages[stageName];
      process.stdout.write(
        `${stageName.padEnd(8)} | ${formatMs(s.meanMs).padStart(9)} | ${formatMs(s.medianMs).padStart(11)} | ${formatMs(s.minMs).padStart(8)} | ${formatMs(s.maxMs).padStart(8)}\n`,
      );
    }
    process.stdout.write('\n');
  }

  if (saveBaseline) {
    const baselinePath = path.join(__dirname, '..', 'baseline.json');
    const baseline = {
      recordedAt: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      warmupIterations: WARMUP_ITERATIONS,
      measuredIterations: MEASURED_ITERATIONS,
      results,
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
    process.stdout.write(`Wrote baseline to ${path.relative(process.cwd(), baselinePath)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
