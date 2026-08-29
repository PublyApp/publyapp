import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
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
// THE RATCHET FLOOR (#1709)
// -------------------------
// The reference file holds a `pinned_step_ids` array that grows monotonically.
// Regeneration can only ADD step IDs to it — never remove them. This breaks
// the 3-step attack where a covered step is deleted from CI, then from the
// manifest, then the reference is regenerated to match.
//
// To deliberately remove a step, the human must confess the removal in
// ci-gate-removals.json, naming the step and why. Without that confession,
// regeneration refuses to lower the floor and exits non-zero.
//
// Usage:
//   node packages/scripts-ts/src/gen-reason-ref.ts
//
// Run it from the repository root. It reads ci-gate-manifest.json and
// overwrites reason-guard-ref.json in place.

const manifestPath = 'packages/scripts-ts/src/ci-gate-manifest.json';
const outputPath = 'packages/scripts-ts/src/reason-guard-ref.json';
const removalsPath = 'packages/scripts-ts/src/ci-gate-removals.json';

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

// --- Ratchet floor: read existing pinned IDs and removals confession ---

const existingRefRaw = await readFile(
	path.resolve(process.cwd(), outputPath),
	'utf8',
);
const existingRef = JSON.parse(existingRefRaw) as {
	pinned_step_ids?: string[];
	steps?: Record<string, unknown>;
};

const existingPinned: string[] = existingRef.pinned_step_ids ?? [];

// Read the removals confession file (optional — may not exist).
let confessedIds: string[] = [];
try {
	const confessionRaw = await readFile(
		path.resolve(process.cwd(), removalsPath),
		'utf8',
	);
	const confession = JSON.parse(confessionRaw) as {
		steps?: Array<{ step_id?: string }>;
	};
	confessedIds = (confession.steps ?? [])
		.map((s) => s.step_id)
		.filter((id): id is string => typeof id === 'string');
} catch {
	// No confession file — that's fine, the ratchet holds.
}

// The new pinned set is the union of existing pinned IDs and new manifest
// steps, MINUS any steps confessed in the removals file.
//
// This is the ratchet: we can only grow the set, never shrink it, unless a
// confession explicitly names the step being removed.
const newStepIds = Object.keys(steps);
const newPinnedSet = new Set([...existingPinned, ...newStepIds]);

// Remove confessed IDs — but only if they are NOT in the current manifest.
// A confession for a step that still exists in the manifest is a no-op (the
// step is still pinned, which is fine).
for (const id of confessedIds) {
	if (!newStepIds.includes(id)) {
		newPinnedSet.delete(id);
	}
}

const newPinned = [...newPinnedSet].sort();

// Check for steps that disappeared without confession. These are steps that
// were pinned in the existing reference but are not in the new manifest and
// not in the confession file.
const vanishedWithoutConfession = existingPinned.filter(
	(id) => !newStepIds.includes(id) && !confessedIds.includes(id),
);

if (vanishedWithoutConfession.length > 0) {
	console.error(
		`Refusing to regenerate: ${vanishedWithoutConfession.length} pinned step(s) vanished from the manifest without a confession.\n`,
	);
	for (const id of vanishedWithoutConfession) {
		console.error(`  VANISHED  ${id}`);
	}
	console.error(
		`\nTo remove a step deliberately, confess it in ${removalsPath} with a reason naming what was lost and why. See docs/guides/local-ci-gate.md.`,
	);
	process.exit(1);
}

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
		`pinned_step_ids - ratchet floor (#1709). This array grows monotonically.`,
		'Regeneration can only ADD step IDs, never remove them. To deliberately',
		'remove a step, confess it in ci-gate-removals.json with a reason.',
		'',
		'Regenerate with: node packages/scripts-ts/src/gen-reason-ref.ts',
		'See docs/guides/local-ci-gate.md.',
	],
	pinned_step_ids: newPinned,
	steps: reference,
};

const json = JSON.stringify(output, null, '\t') + '\n';
await writeFile(path.resolve(process.cwd(), outputPath), json, 'utf8');
console.log(
	`Regenerated ${outputPath} with ${Object.keys(reference).length} reason fingerprints (${newPinned.length} pinned).`,
);
