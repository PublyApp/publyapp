import { execFileSync } from 'node:child_process';

// #1726: a branch that predates a feature merge still runs its e2e test,
// taken from the base — and the failure blames the wrong PR. Before the test
// touches any UI that may not exist in the current tree, verify that the
// feature commit is an ancestor of HEAD. If it is not, the branch is older
// than the feature merge: fail LOUDLY naming the situation and the remedy
// (rebase) instead of letting a downstream assertion break on a missing page.
//
// #2009: the ancestor probe MUST NOT substitute a verdict for input it cannot
// evaluate. `git merge-base --is-ancestor <sha> HEAD` exits 1 when the commit
// is present but not an ancestor, and 128 when the commit is not in the
// checkout at all (observed 2026-08-31: `fatal: Not a valid commit name`).
// The old code read ANY non-zero exit as "not an ancestor", so a shallow
// checkout whose history never contained the commit reported "branch is
// older than the feature merge" and told the author to rebase — a rebase
// cannot fetch a commit the checkout never had. The guard now separates the
// cases BEFORE deciding anything:
//   1. Is the repository shallow?   (`git rev-parse --is-shallow-repository`)
//   2. Is the commit present?       (`git cat-file -e <sha>^{commit}`)
// Then:
//   - present, not an ancestor → the original #1726 message, which is correct
//   - absent → a DIFFERENT message naming the missing history and the real
//     remedy (fetch-depth: 0 on the job, or fetch that commit), never rebase
//   - git itself failing for any other reason → fail loud with git's stderr

interface GitRun {
	status: number;
	stdout: string;
	stderr: string;
}

const runGit = (cwd: string, args: string[]): GitRun => {
	try {
		const stdout = execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		return { status: 0, stdout, stderr: '' };
	} catch (error) {
		const err = error as {
			status?: unknown;
			stderr?: Buffer | string;
		};
		const status = typeof err.status === 'number' ? err.status : -1;

		let stderr: string;
		if (typeof err.stderr === 'string') {
			stderr = err.stderr;
		} else if (err.stderr instanceof Buffer) {
			stderr = err.stderr.toString('utf8');
		} else {
			stderr = String(error);
		}

		return { status, stdout: '', stderr };
	}
};

export const checkFeatureAncestry = (
	featureCommit: string,
	featureName: string,
	options: { cwd?: string } = {},
): void => {
	const cwd = options.cwd ?? process.cwd();

	// Case 1: describe the checkout. A failure here — not a git repository,
	// git absent from PATH — is itself a failure to evaluate: the guard never
	// substitutes a compliant-looking verdict for input it cannot evaluate.
	const shallow = runGit(cwd, ['rev-parse', '--is-shallow-repository']);
	if (shallow.status !== 0) {
		throw new Error(
			[
				`This repository cannot be evaluated: git rev-parse --is-shallow-repository failed.`,
				`git said: ${shallow.stderr.trim()}`,
				`The ancestry check for ${featureName} cannot decide anything about a checkout git itself cannot describe.`,
			].join('\n'),
		);
	}
	const isShallowCheckout = shallow.stdout.trim() === 'true';

	// Case 2: is the commit even in this checkout? `cat-file -e` is the
	// presence probe; a non-zero exit here means the commit is absent, which
	// is a checkout problem, not a branch-age problem.
	const present = runGit(cwd, ['cat-file', '-e', `${featureCommit}^{commit}`]);
	if (present.status !== 0) {
		throw new Error(
			[
				`This checkout has no history for the ${featureName} merge (${featureCommit}).`,
				`The commit is missing, so ancestry cannot be evaluated.`,
				isShallowCheckout
					? `Cause: shallow checkout (fetch-depth: 1 or git clone --depth 1) truncated the history before this commit.`
					: `Cause: the commit is not present in this repository at all.`,
				`Remedy: fetch the history — set fetch-depth: 0 on the job, or git fetch <sha> — and retry.`,
				`The test is not at fault.`,
				`git said: ${present.stderr.trim()}`,
			].join('\n'),
		);
	}

	// Case 3: commit present — is it an ancestor? Exit 0 is an ancestor,
	// exit 1 is genuinely not an ancestor (the #1726 case), anything else is
	// a git failure that must fail loud with git's own stderr.
	const ancestor = runGit(cwd, [
		'merge-base',
		'--is-ancestor',
		featureCommit,
		'HEAD',
	]);
	if (ancestor.status === 0) {
		return;
	}

	if (ancestor.status === 1) {
		throw new Error(
			[
				`This branch is older than the ${featureName} merge (${featureCommit}).`,
				`The e2e test for ${featureName} cannot run on a tree that predates it.`,
				`Rebase on top of develop and retry — the test is not at fault.`,
			].join('\n'),
		);
	}

	throw new Error(
		[
			`This repository cannot be evaluated: git merge-base --is-ancestor failed for ${featureCommit}.`,
			`git said: ${ancestor.stderr.trim()}`,
			`The ancestry check for ${featureName} never substitutes a verdict for input it cannot evaluate.`,
		].join('\n'),
	);
};
