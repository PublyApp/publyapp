import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Guard: detect shallow repositories that can cause history comparison to lie.
//
// WHAT THIS PROVES
// ----------------
// A shallow repository (one created with `git clone --depth N` or similar) has a
// `.git/shallow` file listing the commits it considers "too far back" to fetch.
// When this file exists, git operations like `git merge-base` return empty
// results, causing history comparison tools to produce empty diffs instead of
// failing with an error.
//
// Fail-Loud Contract
// ------------------
// If the git command itself fails (not a shallow-detection result, but an
// actual invocation error), the guard EXITS WITH ERROR (exit 1). A git failure
// is NOT treated as "not shallow" — that would be the exact silent-green
// failure mode this guard exists to prevent.
//
// See issue #1771.

const runGit = (cwd: string): string => {
	try {
		return execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
			cwd,
			encoding: 'utf8',
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			'[shallow-repo] git rev-parse failed — cannot determine shallow status.',
		);
		console.error(`  Cause: ${message}`);
		console.error(
			'  Action: re-run from a git repository root, or investigate the git error above.',
		);
		process.exit(1);
	}
};

export const isShallowRepo = (options: { cwd?: string } = {}): boolean => {
	const { cwd = process.cwd() } = options;
	const output = runGit(cwd);
	return output.trim() === 'true';
};

const run = () => {
	const shallow = isShallowRepo();

	if (shallow) {
		console.error(
			'[shallow-repo] This repository is shallow (created with --depth).',
		);
		console.error('');
		console.error(
			'History comparison tools will silently produce empty results.',
		);
		console.error('');
		console.error(
			'ACTION: Fetch full history with: git fetch --unshallow origin',
		);
		console.error(
			'Or create a new worktree: git worktree add .worktrees/wt-fresh develop',
		);
		process.exit(1);
	}

	console.log('[shallow-repo] repository is not shallow. [OK]');
};

// `process.argv[1]` is undefined under `node -e` / `node --input-type=module -e`
// (no script file): pathToFileURL(undefined) must not run, or importing the
// module from a `-e` context — including this guard's own fail-loud tests —
// would crash on the import line instead of exercising the guard.
const cliEntry = process.argv[1];
if (
	cliEntry !== undefined &&
	import.meta.url === pathToFileURL(cliEntry).href
) {
	run();
}
