import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Refuses an e2e pull whose tag is not this checkout's tree hash (#1063):
// the tag names content, so a hand-set tag or another commit cannot pull
// images built from different code. Tree tags are kept for reuse.

export const expectedImageTag = (tree: string): string => `tree-${tree}`;

/** The `::error::` annotation a mismatch earns, or null when it matches. */
export const mismatchMessage = (tag: string, tree: string): string | null => {
	const expected = expectedImageTag(tree);
	if (tag === expected) {
		return null;
	}
	return `::error::e2e image tag ${tag} does not match the checked-out tree ${expected}; rerun all jobs`;
};

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
