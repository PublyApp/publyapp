import { execFileSync } from 'node:child_process';

// #1726: a branch that predates a feature merge still runs its e2e test,
// taken from the base — and the failure blames the wrong PR. Before the test
// touches any UI that may not exist in the current tree, verify that the
// feature commit is an ancestor of HEAD. If it is not, the branch is older
// than the feature merge: fail LOUDLY naming the situation and the remedy
// (rebase) instead of letting a downstream assertion break on a missing page.

const runGit = (cwd: string, args: string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

export const checkFeatureAncestry = (
	featureCommit: string,
	featureName: string,
	options: { cwd?: string } = {},
): void => {
	const cwd = options.cwd ?? process.cwd();

	let isAncestor: boolean;
	try {
		runGit(cwd, ['merge-base', '--is-ancestor', featureCommit, 'HEAD']);
		isAncestor = true;
	} catch {
		isAncestor = false;
	}

	if (!isAncestor) {
		throw new Error(
			[
				`This branch is older than the ${featureName} merge (${featureCommit}).`,
				`The e2e test for ${featureName} cannot run on a tree that predates it.`,
				`Rebase on top of develop and retry — the test is not at fault.`,
			].join('\n'),
		);
	}
};
