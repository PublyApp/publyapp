import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Refuses an e2e pull whose image tag does not address the tree this job
// checked out (#1063). The tag is the git tree hash, so this is an exact
// content check: a partial re-run of a different commit, or a hand-set tag,
// cannot pull images built from other code. Tree tags are retained for
// merge-queue reuse, so the old "cleanup deleted them" failure mode is gone;
// this check is what keeps the pull honest.
//
// Formerly the `run:` block of ci.yml::e2e-smoke|e2e-test::Detect partial rerun
// (docs/guides/languages.md: a computed value plus a conditional failure is
// logic, so it is a script).

/** The only tag this checkout may pull: the tree hash, prefixed. */
export const expectedImageTag = (tree: string): string => `tree-${tree}`;

/** The `::error::` annotation a mismatched tag earns, or null when it matches. */
export const mismatchMessage = (tag: string, tree: string): string | null => {
	const expected = expectedImageTag(tree);

	if (tag === expected) {
		return null;
	}

	return `::error::e2e image tag ${tag} does not match the checked-out tree ${expected}; rerun all jobs`;
};

/** The tree of the commit actually checked out — never `github.sha` by proxy. */
export const checkedOutTree = (): string =>
	execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
		encoding: 'utf8',
	}).trim();

const run = () => {
	const message = mismatchMessage(
		process.env.E2E_IMAGE_TAG ?? '',
		checkedOutTree(),
	);

	if (message !== null) {
		console.log(message);
		process.exit(1);
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
