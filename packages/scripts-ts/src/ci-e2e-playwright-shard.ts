import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Runs one Playwright shard of the e2e suite, plus the shard-2-only guards that
// do not fit the per-project shard split.
//
// Formerly the `run:` block of ci.yml::e2e-test::Run Playwright shard: install
// the browser, run `--shard=N/2`, then an `if [ "${{ matrix.shard }}" = "2" ]`
// running the setup project, the two hermetic projects and the drawer-contrast
// check (docs/guides/languages.md: a condition is logic, so it is a script).

const playwright = (...args: string[]) =>
	spawnSync('pnpm', ['--filter', 'front', 'exec', 'playwright', ...args], {
		stdio: 'inherit',
	});

/** Extra commands shard 2 owns after the sharded projects have run. */
export const shardTwoCommands = (): string[][] => [
	['test', '--project=setup', '--no-deps'],
	['test', '--project=chromium-hermetic-counter', '--no-deps'],
	['test', '--project=chromium-hermetic-source', '--no-deps'],
];

const mustRun = (command: string, args: string[]) => {
	const result = spawnSync(command, args, { stdio: 'inherit' });

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
};

const run = () => {
	const shard = process.argv[2] ?? process.env.MATRIX_SHARD;
	const total = process.argv[3] ?? '2';

	if (shard === undefined) {
		console.error('usage: ci-e2e-playwright-shard.ts <shard> [total]');
		process.exit(1);
	}

	mustRun('pnpm', [
		'--filter',
		'front',
		'exec',
		'playwright',
		'install',
		'chromium',
		'--with-deps',
	]);

	const sharded = playwright(
		'test',
		'--project=chromium',
		'--project=chromium-faults',
		`--shard=${shard}/${total}`,
	);

	if (sharded.status !== 0) {
		process.exit(sharded.status ?? 1);
	}

	if (shard !== '2') {
		return;
	}

	for (const args of shardTwoCommands()) {
		const result = playwright(...args);

		if (result.status !== 0) {
			process.exit(result.status ?? 1);
		}
	}

	mustRun('pnpm', ['--filter', 'front', 'test:drawer-contrast']);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
