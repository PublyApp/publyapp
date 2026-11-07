import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Runs the changed-path classifier from the PR's BASE commit, and fails closed
// to every lane when that base copy is missing or speaks an ABI this run does
// not understand.
//
// Formerly the `run:` block of ci.yml::classify. The shell version built a path
// in a variable, probed it with `[ -f ]` + `grep -Fq`, and looped over the lane
// names to write the fail-closed outputs (docs/guides/languages.md: that is
// logic, so it is a script).

const classifierPath = 'base-ref/packages/scripts-ts/src/ci-changed-paths.ts';
const abiMarker = 'CI_CLASSIFIER_ABI_VERSION = 2';

/** Every lane output the classifier owns; the fail-closed fallback sets them all. */
export const LANES = [
	'quality',
	'front',
	'api',
	'e2e',
	'docs',
	'react',
] as const;

/**
 * True when the base checkout carries a classifier whose ABI this workflow can
 * read. A missing file, or a file declaring a different ABI version, is not.
 */
export const classifierIsCurrent = (path: string = classifierPath): boolean =>
	existsSync(path) && readFileSync(path, 'utf8').includes(abiMarker);

const writeFailClosedOutputs = () => {
	const githubOutput = process.env.GITHUB_OUTPUT;

	if (githubOutput === undefined) {
		throw new Error(
			'GITHUB_OUTPUT is not set — the fail-closed lane outputs have nowhere to go.',
		);
	}

	for (const lane of LANES) {
		appendFileSync(githubOutput, `${lane}=true\n`);
	}
};

const run = () => {
	if (classifierIsCurrent()) {
		const result = spawnSync(process.execPath, [classifierPath, '--lanes'], {
			stdio: 'inherit',
		});

		process.exit(result.status ?? 1);
	}

	console.log(
		'::warning::base classifier ABI is unavailable; failing closed to every lane',
	);
	writeFailClosedOutputs();
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
