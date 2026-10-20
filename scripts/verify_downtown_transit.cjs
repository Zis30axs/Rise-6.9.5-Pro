#!/usr/bin/env node
/* Compile in an isolated CommonJS directory, including on Windows. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let build;
try {
  const compiler = require.resolve('typescript/bin/tsc');
  build = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-downtown-'));
  // The project uses type=module; the temporary compile target is explicitly CJS.
  fs.writeFileSync(path.join(build, 'package.json'), '{"type":"commonjs"}\n');
  const check = spawnSync(process.execPath, [
    compiler, '--strict', '--target', 'ES2022', '--module', 'commonjs',
    '--outDir', build, 'src/runtime/downtown-transit-policy.ts',
  ], { cwd: root, stdio: 'inherit' });
  if (check.error) throw check.error;
  if (check.status !== 0) throw new Error(`TypeScript check failed: ${check.status ?? check.signal}`);
  const result = spawnSync(process.execPath, ['--test', 'tests/downtown-transit-policy.node.cjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, UC_DOWNTOWN_BUILD: build },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Route tests failed: ${result.status ?? result.signal}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Requires the project TypeScript dependency; no packages are installed automatically.');
  process.exitCode = 1;
} finally {
  if (build) fs.rmSync(build, { recursive: true, force: true });
}
