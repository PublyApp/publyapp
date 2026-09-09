import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import { findProjectClosureRoot } from './project-closure-root.ts';

const repoRoot = join(
	dirname(new URL(import.meta.url).pathname),
	'../..',
	'..',
);
const sharedToolRoot = findProjectClosureRoot();
const environment = { ...process.env };

if (sharedToolRoot !== undefined) {
	environment.PR_CLOSURE_GATE_ROOT = sharedToolRoot;
	console.log(`Using shared project-closure tool at ${sharedToolRoot}`);
} else {
	console.warn(
		'Shared project-closure tool is unavailable; shared-reader integration tests are skipped.',
	);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
	pnpm,
	[
		'--filter',
		'scripts-ts',
		'exec',
		'vitest',
		'run',
		'src/project-closure-adapter.test.ts',
	],
	{ cwd: repoRoot, env: environment, stdio: 'inherit' },
);

if (result.error !== undefined) {
	console.error(result.error);
	process.exitCode = 1;
} else {
	process.exitCode = result.status ?? 1;
}
