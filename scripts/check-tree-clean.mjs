import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Asserts that the given paths are byte-identical to HEAD after a regeneration
// step, mirroring the drift assertions in .github/workflows/openapi-spec-drift.yml.
//
// Uses `git status --porcelain`, not `git diff --exit-code`: a plain diff only
// sees tracked files, so a generator that emits a BRAND NEW file would leave the
// diff empty and the check green while the committed artifacts had in fact
// drifted. The workflow's client check guards against this explicitly; this
// script applies the same standard to every path it is given.
//
// Lives in Node rather than inline shell because the justfile runs under pwsh
// on Windows, where the workflow's bash conditionals do not exist.

export const findTreeDrift = (paths, options = {}) => {
	const { cwd = process.cwd() } = options;

	return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
		cwd,
		encoding: 'utf8',
	});
};

const run = () => {
	const paths = process.argv.slice(2);

	if (paths.length === 0) {
		console.error('Usage: node ./scripts/check-tree-clean.mjs <path> [...paths]');
		process.exit(1);
	}

	const status = findTreeDrift(paths);

	if (status.trim().length > 0) {
		console.error(
			`These generated paths drifted from what is committed: ${paths.join(', ')}\n`,
		);
		console.error(status.trimEnd());
		console.error(
			'\nA clean build + client regeneration must leave the tree untouched.',
		);
		console.error(
			'Run `just build-api-full` and `just generate-client`, then commit the result.',
		);
		process.exit(1);
	}

	console.log(`No drift in: ${paths.join(', ')} [OK]`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	run();
}
