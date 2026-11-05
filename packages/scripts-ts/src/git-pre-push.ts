/**
 * Body of `.husky/pre-push`: block pushes that TARGET a protected branch,
 * regardless of which branch is currently checked out. git feeds each ref
 * being pushed on stdin as `<local ref> <local sha> <remote ref> <remote sha>`.
 * Exact full-ref comparison (refs/heads/main) is intentional: it avoids partial
 * matches against branches like "refs/heads/maintain", and it covers deletions
 * (git push origin :main) and force-pushes because git still reports the same
 * remote_ref value for those operations.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROTECTED = ['refs/heads/main', 'refs/heads/develop'];

/** First protected branch targeted by the pre-push stdin, or undefined. */
export const findProtectedTarget = (stdin: string): string | undefined =>
	stdin
		.split('\n')
		.map((line) => line.trim().split(/\s+/)[2])
		.find((remoteRef) => remoteRef && PROTECTED.includes(remoteRef));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const target = findProtectedTarget(readFileSync(0, 'utf-8'));
	if (target) {
		console.error(
			`Direct push to ${target.replace('refs/heads/', '')} is not allowed, please create a new branch then open a pull request`,
		);
		process.exit(1);
	}
}
