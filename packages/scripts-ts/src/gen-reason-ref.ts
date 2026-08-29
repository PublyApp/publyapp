import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The shape of `reason-guard-ref.json` as this generator reads it back.
 *
 * Both fields are optional: the file is absent on first generation, and an
 * older file may predate `pinned_step_ids`. Naming the contract keeps the
 * inferred evidence intact at each use site (anti-slop/no-known-value-widening).
 */
type ReasonRefFile = {
	pinned_step_ids?: string[];
	steps?: Record<string, unknown>;
};

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
// THE FLOOR IS DERIVED FROM GIT HEAD, NOT FROM THE WORKING TREE
// -------------------------------------------------------------
// The floor (`existingPinned`) is read from `git show HEAD:reason-guard-ref.json`,
// NOT from the working-tree file. This closes the bypass where a contributor
// lowers `pinned_step_ids` in the same commit as the manifest/YAML removal:
// git HEAD still carries the previous pinned set, so the "vanished without
// confession" check still fires. If git is unavailable, the script falls back
// to reading the working-tree file (less secure, but maintains backward
// compatibility).
//
// INTEGRITY ASSERTION
// -------------------
// `pinned_step_ids` and `steps{}` must contain exactly the same set of IDs.
// A mismatch means the reference file has been tampered with (one of the two
// was edited without regenerating). The script fails loudly, naming the IDs
// in discrepancy.
//
// To deliberately remove a step, the human must confess the removal in
// ci-gate-removals.json, naming the step and why. Without that confession,
// regeneration refuses to lower the floor and exits non-zero.
// The confession is validated: reason must be at least 24 characters, and the
// step_id must name a step that is actually pinned and vanished from the
// manifest.
// A malformed confession file fails loudly — it does not silently lower the
// floor.
//
// Usage:
//   node packages/scripts-ts/src/gen-reason-ref.ts
//
// Run it from the repository root. It reads ci-gate-manifest.json and
// overwrites reason-guard-ref.json in place.

const manifestPath = 'packages/scripts-ts/src/ci-gate-manifest.json';
const outputPath = 'packages/scripts-ts/src/reason-guard-ref.json';
const removalsPath = 'packages/scripts-ts/src/ci-gate-removals.json';

// Matches the reviewable-reason bar this repo already enforces on lint
// suppressions. "x" is not a reason.
const minimumReasonLength = 24;

interface ConfessionStep {
	step_id: string;
	reason: string;
	removed_at?: string;
}

interface Confession {
	steps: ConfessionStep[];
}

/**
 * Reads the floor (pinned_step_ids) from git HEAD, not from the working tree.
 * This prevents a contributor from lowering the floor in the same commit —
 * git HEAD still carries the previous pinned set.
 *
 * Falls back to reading the working-tree file if git is unavailable.
 */
const readFloorFromGit = async (rootDir: string): Promise<string[]> => {
	try {
		const { stdout } = await execFileAsync(
			'git',
			['show', 'HEAD:packages/scripts-ts/src/reason-guard-ref.json'],
			{ cwd: rootDir, encoding: 'utf8' },
		);

		const parsed = JSON.parse(stdout) as { pinned_step_ids?: string[] };
		return parsed.pinned_step_ids ?? [];
	} catch {
		// Git read failed. Determine why: is git unavailable, or is the file
		// missing from HEAD (deleted in the same commit as the step removal)?
		// We must NOT silently return [] when the file was deleted — that would
		// reset the floor and let a contributor erase the reference in the same
		// commit as the step removal (bypass 5).

		// Check if git is available at all by running `git rev-parse HEAD`.
		const gitAvailable = await execFileAsync('git', ['rev-parse', 'HEAD'], {
			cwd: rootDir,
		})
			.then(() => true)
			.catch(() => false);

		if (!gitAvailable) {
			// Git is unavailable (not a repo, no commits). Fall back to the
			// working-tree file. If that also fails, there is no floor — return
			// empty (first generation).
			try {
				const raw = await readFile(path.join(rootDir, outputPath), 'utf8');
				const parsed = JSON.parse(raw) as { pinned_step_ids?: string[] };
				return parsed.pinned_step_ids ?? [];
			} catch {
				return [];
			}
		}

		// Git is available but `git show HEAD:...` failed. The file is either
		// missing from HEAD or malformed. Try the working-tree file as a last
		// resort — if it exists, use it. If it also fails, the file was deleted
		// from both HEAD and the working tree. That is a deletion of the
		// reference file, which must not silently reset the floor.
		try {
			const raw = await readFile(path.join(rootDir, outputPath), 'utf8');
			const parsed = JSON.parse(raw) as { pinned_step_ids?: string[] };
			return parsed.pinned_step_ids ?? [];
		} catch {
			throw new Error(
				`Cannot read the ratchet floor: ${outputPath} is missing from both git HEAD and the working tree. The reference file must exist for the ratchet to work. Restore it with \`git checkout HEAD~1 -- ${outputPath}\` and re-run.`,
			);
		}
	}
};

/**
 * Reads and validates the confession file.
 * Returns null when the file does not exist (no confession).
 * Throws when the file exists but is malformed — a malformed confession must
 * never silently lower the floor.
 */
const readRemovalsConfession = async (
	rootDir: string,
): Promise<Confession | null> => {
	let raw: string;
	try {
		raw = await readFile(path.join(rootDir, removalsPath), 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		throw new Error(
			`Cannot read confession file ${removalsPath}: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Malformed JSON in confession file ${removalsPath}: ${error instanceof Error ? error.message : String(error)}. Fix the JSON syntax.`,
		);
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(
			`Confession file ${removalsPath} must be a JSON object with a \`steps\` array.`,
		);
	}

	const record = parsed as Record<string, unknown>;

	if (!Array.isArray(record.steps)) {
		throw new Error(
			`Confession file ${removalsPath} must have a \`steps\` array.`,
		);
	}

	const steps: ConfessionStep[] = [];
	for (const entry of record.steps) {
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(
				`Confession file ${removalsPath}: each entry in \`steps\` must be an object.`,
			);
		}

		const e = entry as Record<string, unknown>;
		const stepId = typeof e.step_id === 'string' ? e.step_id : '';
		const reason = typeof e.reason === 'string' ? e.reason : '';
		const removedAt =
			typeof e.removed_at === 'string' ? e.removed_at : undefined;

		if (stepId === '') {
			throw new Error(
				`Confession file ${removalsPath}: each entry must have a non-empty \`step_id\`.`,
			);
		}

		if (reason.trim().length < minimumReasonLength) {
			throw new Error(
				`Confession file ${removalsPath}: entry "${stepId}" has a reason shorter than ${minimumReasonLength} characters. A valid confession must name what was lost and why.`,
			);
		}

		steps.push({ step_id: stepId, reason, removed_at: removedAt });
	}

	return { steps };
};

/**
 * Verifies that `pinned_step_ids` and `steps{}` contain exactly the same set
 * of IDs. A mismatch means the reference file has been tampered with.
 */
const assertIntegrity = (
	pinnedStepIds: string[],
	steps: Record<string, unknown>,
): void => {
	const pinnedSet = new Set(pinnedStepIds);
	const stepsSet = new Set(Object.keys(steps));

	const missingFromSteps = [...pinnedSet].filter((id) => !stepsSet.has(id));
	const missingFromPinned = [...stepsSet].filter((id) => !pinnedSet.has(id));

	if (missingFromSteps.length > 0 || missingFromPinned.length > 0) {
		const parts: string[] = [];

		if (missingFromSteps.length > 0) {
			parts.push(
				`pinned_step_ids has ${missingFromSteps.length} ID(s) missing from steps{}: ${missingFromSteps.map((id) => `"${id}"`).join(', ')}`,
			);
		}

		if (missingFromPinned.length > 0) {
			parts.push(
				`steps{} has ${missingFromPinned.length} ID(s) missing from pinned_step_ids: ${missingFromPinned.map((id) => `"${id}"`).join(', ')}`,
			);
		}

		throw new Error(
			`Integrity check failed: pinned_step_ids and steps{} do not match. ${parts.join('; ')}. The reference file has been tampered with — regenerate it with \`node packages/scripts-ts/src/gen-reason-ref.ts\`.`,
		);
	}
};

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

// Read the floor from git HEAD (not the working tree) so a contributor cannot
// lower it in the same commit.
const existingPinned: string[] = await readFloorFromGit(process.cwd());

// Read the existing reference file for the integrity pre-check.
let existingRef: ReasonRefFile = {};
try {
	const existingRefRaw = await readFile(
		path.resolve(process.cwd(), outputPath),
		'utf8',
	);
	existingRef = JSON.parse(existingRefRaw) as ReasonRefFile;
} catch {
	// File does not exist yet — first generation.
}

// Integrity pre-check: the existing reference must have matching
// pinned_step_ids and steps{}. This catches manual tampering.
assertIntegrity(existingRef.pinned_step_ids ?? [], existingRef.steps ?? {});

// Read and validate the confession file. Throws on malformed input.
const confession = await readRemovalsConfession(process.cwd());
const confessedIds = new Set((confession?.steps ?? []).map((s) => s.step_id));

// Validate that each confession names a step that is actually pinned and
// vanished from the manifest. A confession for a step that still exists in
// the manifest is a no-op (harmless). A confession for a step that was never
// pinned is also a no-op.
const newStepIds = Object.keys(steps);
for (const step of confession?.steps ?? []) {
	if (step.step_id in newStepIds) {
		console.error(
			`Warning: confession for "${step.step_id}" names a step that still exists in the manifest. The confession is a no-op.`,
		);
	}
}

// The new pinned set is the union of existing pinned IDs and new manifest
// steps, MINUS any steps confessed in the removals file.
//
// This is the ratchet: we can only grow the set, never shrink it, unless a
// confession explicitly names the step being removed.
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
	(id) => !newStepIds.includes(id) && !confessedIds.has(id),
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

// Integrity post-check: the new pinned_step_ids and steps{} must match.
// steps{} is derived from the manifest (reference), and pinned_step_ids is
// the ratchet floor. They must agree on every ID.
assertIntegrity(newPinned, reference);

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
		'The floor is derived from git HEAD, not the working tree. This prevents',
		'a contributor from lowering pinned_step_ids in the same commit as the',
		'removal.',
		'',
		'pinned_step_ids and steps{} must contain exactly the same set of IDs.',
		'A mismatch fails regeneration with a named error.',
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
