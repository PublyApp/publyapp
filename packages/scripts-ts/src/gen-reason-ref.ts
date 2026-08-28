import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Generation script for packages/scripts-ts/src/reason-guard-ref.json.
//
// The reason guard (check-ci-drift.ts) detects truncation or alteration of a
// CI step's reason while the step hash is unchanged. This script regenerates
// the reference fingerprints from the current ci-gate-manifest.json so that
// a deliberate reason rewrite can be shipped in the same commit as the change
// itself.
//
// Usage:
//   node packages/scripts-ts/src/gen-reason-ref.ts
//
// Run it from the repository root. It reads ci-gate-manifest.json and
// overwrites reason-guard-ref.json in place.

const manifestPath = 'packages/scripts-ts/src/ci-gate-manifest.json';
const outputPath = 'packages/scripts-ts/src/reason-guard-ref.json';

const manifestRaw = readFileSync(
	path.resolve(process.cwd(), manifestPath),
	'utf8',
);
const manifest = JSON.parse(manifestRaw) as {
	steps?: Record<
		string,
		{ reason: string; hash: string; mirror: string | null }
	>;
};

const steps = manifest.steps ?? {};

const reference = Object.fromEntries(
	Object.entries(steps)
		.filter(([, entry]) => typeof entry?.reason === 'string')
		.map(([id, entry]) => [
			id,
			{
				reason_hash: createHash('sha256')
					.update(entry.reason)
					.digest('hex')
					.slice(0, 16),
				reason_length: entry.reason.length,
			},
		]),
);

const output = {
	$comment: [
		'Reference fingerprints for the reason guard. Read by packages/scripts-ts/src/check-ci-drift.ts.',
		'',
		'One entry per step in ci-gate-manifest.json, keyed identically.',
		'  reason_hash  - SHA-256 (first 16 hex chars) of the reason text.',
		'  reason_length - character count of the reason text.',
		'',
		'The reason text is used as-is: after JSON.parse, escape sequences are',
		'already decoded to UTF-8, so no normalization step is needed.',
		'',
		'The guard fails when a reason changes (especially SHRINKS) while the step hash',
		'is unchanged. A deliberate rewrite is possible by regenerating this file',
		'in the same commit as the manifest change \u2014 same mechanism as the complexity',
		'ceilings (cyclomatic-bound-ref.json).',
		'',
		'Regenerate with: node packages/scripts-ts/src/gen-reason-ref.ts',
		'See docs/guides/local-ci-gate.md.',
	],
	steps: reference,
};

const json = JSON.stringify(output, null, '\t') + '\n';
await writeFile(path.resolve(process.cwd(), outputPath), json, 'utf8');
console.log(
	`Regenerated ${outputPath} with ${Object.keys(reference).length} reason fingerprints.`,
);
