import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Guard: catch when `git merge-base` lies — the two #1771/#1773 failure modes.
//
// WHAT THIS PROVES
// ----------------
// On 2026-08-29 a shallow fetch grafted origin/develop: `.git/shallow` cut the
// history so `git merge-base origin/develop HEAD` returned EMPTY and every tool
// built on it (`git diff $(git merge-base ...)..HEAD`, merge-tree, the #1733
// manifest-loss scanner) measured against nothing while reporting green. The
// follow-up "repair" (`git fetch --deepen=3000 origin develop`, #1773) did not
// remove the graft: it re-seeded it, so each invocation re-grafted the repo for
// the next one.
//
// This guard FAILS LOUDLY when merge-base returns empty or git itself errors.
// An empty merge-base is NEVER treated as "no diff" — that is the silent-green
// failure mode from the incident. An absent reference (git errors) is also a
// loud failure, never a compliant default.
//
// Fail-Loud Contract
// ------------------
// - `git merge-base` returns a non-empty SHA            -> green.
// - `git merge-base` returns empty                       -> red, names the cause
//   (shallow graft or genuinely unrelated histories).
// - `git merge-base` errors (missing ref, not a repo)    -> red, names the error.
//
// REPAIR (exported, verified, IDEMPOTENT)
// ---------------------------------------
// `repairShallowGraft` removes the graft with `git fetch --unshallow origin`
// and POST-VERIFIES that the repository no longer reports shallow. It is
// idempotent by construction: a complete repository is left untouched (git
// itself rejects a second `--unshallow`), so running it twice yields the same
// final state — unlike the #1773 `--deepen` repair, which re-seeded the graft
// on every invocation. The test suite runs it TWICE and asserts the identical
// final state, and its post-verification catches any mutation that restores a
// `--deepen`-style repair (the repository would still report shallow).

type MergeBaseResult =
	| { ok: true; sha: string }
	| { ok: false; reason: string };

const gitError = (error: unknown): string => {
	const err = error as { stderr?: string | Buffer; message?: string };
	if (err.stderr !== undefined && String(err.stderr).trim().length > 0) {
		return String(err.stderr).trim();
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};

const runGit = (cwd: string, args: string[]): string => {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
};

const runMergeBase = (
	cwd: string,
	ref1: string,
	ref2: string,
): MergeBaseResult => {
	let output: string;
	try {
		output = runGit(cwd, ['merge-base', ref1, ref2]);
	} catch (error) {
		return {
			ok: false,
			reason: `git merge-base ${ref1} ${ref2} failed: ${gitError(error)}`,
		};
	}

	const sha = output.trim();
	if (sha.length === 0) {
		return {
			ok: false,
			reason: `git merge-base ${ref1} ${ref2} returned empty — the repository is shallow (a graft cuts the shared history) or the two refs share no ancestry.`,
		};
	}

	return { ok: true, sha };
};

export const findMergeBase = (
	options: {
		cwd?: string;
		ref1?: string;
		ref2?: string;
	} = {},
): MergeBaseResult => {
	const {
		cwd = process.cwd(),
		ref1 = 'origin/develop',
		ref2 = 'HEAD',
	} = options;
	return runMergeBase(cwd, ref1, ref2);
};

type RepairResult =
	| { ok: true; message: string }
	| { ok: false; reason: string };

/**
 * Removes a shallow graft with `git fetch --unshallow origin` and verifies
 * the outcome. Idempotent: a repository that already reports complete is left
 * untouched (a second `git fetch --unshallow` on a complete repository is a
 * git fatal error, so short-circuiting is what makes the repair repeatable).
 * The post-verification proves the graft is really gone; a repair that merely
 * deepened (`--deepen=3000 origin develop`, the #1773 regression) leaves the
 * repository shallow and is rejected here.
 */
export const repairShallowGraft = (
	options: { cwd?: string } = {},
): RepairResult => {
	const { cwd = process.cwd() } = options;

	let shallowOutput: string;
	try {
		shallowOutput = runGit(cwd, ['rev-parse', '--is-shallow-repository']);
	} catch (error) {
		return {
			ok: false,
			reason: `cannot determine shallow status: ${gitError(error)}`,
		};
	}

	if (shallowOutput.trim() !== 'true') {
		return {
			ok: true,
			message: 'repository is already complete — nothing to repair',
		};
	}

	try {
		runGit(cwd, ['fetch', '--unshallow', 'origin']);
	} catch (error) {
		return {
			ok: false,
			reason: `git fetch --unshallow origin failed: ${gitError(error)}`,
		};
	}

	let verified: string;
	try {
		verified = runGit(cwd, ['rev-parse', '--is-shallow-repository']);
	} catch (error) {
		return {
			ok: false,
			reason: `post-repair shallow check failed: ${gitError(error)}`,
		};
	}

	if (verified.trim() !== 'false') {
		return {
			ok: false,
			reason:
				'repository still reports shallow after git fetch --unshallow origin — the graft was not removed (did the repair deepen instead of unshallowing?)',
		};
	}

	return {
		ok: true,
		message:
			'repository unshallowed and verified — merge-base comparisons resolve again',
	};
};

const run = () => {
	const [ref1 = 'origin/develop', ref2 = 'HEAD'] = process.argv.slice(2);
	const result = findMergeBase({ ref1, ref2 });

	if (result.ok) {
		console.log(
			`[merge-base] merge-base(${ref1}, ${ref2}) resolved: ${result.sha.slice(0, 12)} [OK]`,
		);
		return;
	}

	console.error(`[merge-base] ${result.reason}`);
	console.error('');
	console.error(
		'The empty/erroring merge-base is NEVER treated as "no diff" — a silent-green history comparison is the exact failure mode from #1771/#1773.',
	);
	console.error('');
	console.error(
		'ACTION: if the repository is shallow (git rev-parse --is-shallow-repository prints true), fetch full history with: git fetch --unshallow origin',
	);
	console.error(
		'Or create a new worktree: git worktree add .worktrees/wt-fresh develop',
	);
	process.exit(1);
};

// `process.argv[1]` is undefined under `node -e` / `node --input-type=module -e`
// (no script file), so the entry check must not dereference it unconditionally:
// pathToFileURL(undefined) throws at import time and breaks every consumer that
// imports the module from a `-e` context — including this guard's own tests.
const cliEntry = process.argv[1];
if (
	cliEntry !== undefined &&
	import.meta.url === pathToFileURL(cliEntry).href
) {
	run();
}
