import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * A reason is filler when it carries no information — a single repeated
 * character padded to clear the length bar (e.g. `"x".repeat(24)`). Such a
 * string is not a reviewable justification; it is a bypass of the quality
 * bar. We reject it regardless of length.
 */
const isFiller = (text: string): boolean => {
	if (text.length === 0) return false;
	const first = text[0];
	for (let i = 1; i < text.length; i++) {
		if (text[i] !== first) return false;
	}
	return true;
};

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
// THE FLOOR IS DERIVED FROM THE MERGE-BASE (origin/develop ∩ HEAD), NOT HEAD
// -------------------------------------------------------------
// The floor (`existingPinned`) is read from
// `git show <merge-base>:reason-guard-ref.json`, where the merge-base is
// `git merge-base origin/develop HEAD`. NOT from HEAD (the attacker's commit
// in a PR) or the working tree. This closes the bypass where a contributor
// deletes a CI step, removes its manifest entry, AND lowers pinned_step_ids —
// all in one committed push — making HEAD agree with the removal.
//
// If the merge-base cannot be resolved (no origin/develop, not a repo), the
// script falls back to `git show HEAD:` (still committed, not working-tree) so
// local/first-run generation works. If HEAD also lacks the file, it is either
// first-generation (never committed → empty floor) or a deletion attack
// (was committed, now gone → refuse loudly).
//
// INTEGRITY ASSERTION
// -------------------
// `pinned_step_ids` and `steps{}` are correlated through ci-gate-manifest.json:
//
//   - Every pinned step must be tracked in steps{}. A pinned step dropped from
//     steps{} is a floor-lowering attack — refuse loudly.
//   - Extra steps in steps{} that exist in the manifest are legitimate growth
//     (the manifest gained steps since the last generation). The ratchet absorbs
//     them.
//   - Extra steps in steps{} that are NOT in the manifest are phantom steps
//     inserted into the reference — refuse loudly.
//
// This distinction lets a legitimate manifest growth (another PR added a step)
// regenerate without silently opening the door to tampering.
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

const refFileName = 'packages/scripts-ts/src/reason-guard-ref.json';

/**
 * Reads the floor (pinned_step_ids) from the merge-base of origin/develop and
 * HEAD — not from HEAD directly, and not from the working tree.
 *
 * The merge-base is the last reviewed-and-merged state of the target branch.
 * Reading the floor from it means a contributor cannot lower `pinned_step_ids`
 * in the same commit as a step removal — HEAD IS the attacker's commit in a PR,
 * and reading from HEAD would let the committed floor agree with the removal.
 *
 * If the merge-base cannot be resolved (no git, not a repo, no origin/develop,
 * no common ancestor), the function falls back to reading from HEAD (the last
 * commit). This is less secure than the merge-base — it doesn't catch a
 * committed floor-lowering — but it still catches an uncommitted working-tree
 * edit (which HEAD preserves). This fallback exists for local generation
 * without a fetched origin/develop. Enforcement (check-ci-drift.ts) has no such
 * fallback: it refuses to run when the merge-base can't be resolved.
 *
 * If HEAD also cannot be read (file deleted from the commit), the function
 * throws — it must NOT silently reset the floor to empty. A deleted reference
 * file is either a first-generation case (the file was never committed, which
 * `git show HEAD:` will reject with a clear error) or a deletion attack (the
 * file existed and was removed). The caller distinguishes these.
 */
const readFloorFromGit = async (rootDir: string): Promise<string[]> => {
	// Step 1: try the merge-base (the secure floor).
	try {
		const { stdout: mbStdout } = await execFileAsync(
			'git',
			['merge-base', 'origin/develop', 'HEAD'],
			{ cwd: rootDir, encoding: 'utf8' },
		);
		const mergeBase = mbStdout.trim();

		if (mergeBase === '') {
			throw new Error('merge-base returned empty');
		}

		const { stdout } = await execFileAsync(
			'git',
			['show', `${mergeBase}:${refFileName}`],
			{ cwd: rootDir, encoding: 'utf8' },
		);

		const parsed = JSON.parse(stdout) as { pinned_step_ids?: string[] };
		return parsed.pinned_step_ids ?? [];
	} catch (mergeBaseError) {
		// Step 2: merge-base failed (no origin/develop, not a repo, etc.).
		// Fall back to HEAD — still committed (not working-tree), so an
		// uncommitted edit cannot lower the floor.
		try {
			const { stdout } = await execFileAsync(
				'git',
				['show', `HEAD:${refFileName}`],
				{ cwd: rootDir, encoding: 'utf8' },
			);

			const parsed = JSON.parse(stdout) as { pinned_step_ids?: string[] };
			return parsed.pinned_step_ids ?? [];
		} catch (headError) {
			// HEAD also failed — the file does not exist at HEAD. Distinguish:
			//  - first-generation: the file was never committed → return []
			//  - deletion attack: the file WAS committed and was removed → throw
			try {
				const { stdout: logOut } = await execFileAsync(
					'git',
					['log', '--oneline', '--all', '--', refFileName],
					{ cwd: rootDir, encoding: 'utf8' },
				);

				// If git log returned output, the file was committed at some
				// point and then deleted — deletion attack, not first-gen.
				if (logOut.trim().length > 0) {
					throw new Error(
						`Cannot read the ratchet floor from git: ${refFileName} was committed and then deleted — the reference file has been tampered with (deletion attack). ` +
							`Restore it with \`git checkout HEAD -- ${refFileName}\` and re-run, or see docs/guides/local-ci-gate.md.`,
					);
				}

				// No git log entries — the file was never committed. First-gen.
				return [];
			} catch (logError) {
				if (
					logError instanceof Error &&
					logError.message.includes('deletion attack')
				) {
					throw logError;
				}

				// git log itself failed (e.g., not a git repo). Fall through to
				// throwing the original HEAD error with context.
				throw new Error(
					`Cannot read the ratchet floor from git: ${refFileName} does not exist at HEAD or merge-base. ` +
						`Merge-base error: ${mergeBaseError instanceof Error ? mergeBaseError.message : String(mergeBaseError)}. ` +
						`HEAD error: ${headError instanceof Error ? headError.message : String(headError)}. ` +
						`Git log error: ${logError instanceof Error ? logError.message : String(logError)}.`,
				);
			}
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

		if (isFiller(reason.trim())) {
			throw new Error(
				`Confession file ${removalsPath}: entry "${stepId}" has a reason that is filler (a single repeated character). A valid confession must be a reviewable justification naming what was lost and why — filler is not a reason.`,
			);
		}

		steps.push({ step_id: stepId, reason, removed_at: removedAt });
	}

	return { steps };
};

/**
 * Verifies the integrity of the reference file against the manifest.
 * `pinned_step_ids` must be a subset of steps{} (a pinned step dropped
 * from steps{} is a floor-lowering attack). Extra steps in steps{} fall
 * into two buckets: those present in the manifest are legitimate growth
 * (the ratchet absorbs them); those NOT in the manifest are phantom steps
 * (tampering). Throws loudly on any violation.
 */
const assertIntegrity = (
	pinnedStepIds: string[],
	steps: Record<string, unknown>,
	manifestSteps: Record<string, unknown>,
): void => {
	const pinnedSet = new Set(pinnedStepIds);
	const stepsSet = new Set(Object.keys(steps));
	const manifestSet = new Set(Object.keys(manifestSteps));

	// A pinned step removed from steps{} is a floor-lowering attack: someone
	// dropped a tracked step from the reference so the guard stops monitoring
	// it. This is never legitimate — refuse loudly, naming the orphaned ID.
	const missingFromSteps = [...pinnedSet].filter((id) => !stepsSet.has(id));
	if (missingFromSteps.length > 0) {
		throw new Error(
			`Integrity check failed: pinned_step_ids has ${missingFromSteps.length} ID(s) missing from steps{}: ${missingFromSteps.map((id) => `"${id}"`).join(', ')}. A pinned step was removed from tracking — the reference file has been tampered with (floor-lowering attack). Restore it with \`git checkout HEAD -- ${outputPath}\` and re-run.`,
		);
	}

	// Extra steps in steps{} fall into two buckets. If the step exists in the
	// manifest, the manifest grew since the last generation — legitimate, the
	// ratchet will absorb it. If the step is NOT in the manifest, someone added
	// a phantom step to steps{} — tampering, refuse loudly.
	const phantomFromPinned = [...stepsSet].filter(
		(id) => !pinnedSet.has(id) && !manifestSet.has(id),
	);

	if (phantomFromPinned.length > 0) {
		throw new Error(
			`Integrity check failed: steps{} has ${phantomFromPinned.length} ID(s) not present in ci-gate-manifest.json: ${phantomFromPinned.map((id) => `"${id}"`).join(', ')}. These phantom steps were inserted into the reference file — the file has been tampered with. Remove them manually or restore with \`git checkout HEAD -- ${outputPath}\` and re-run.`,
		);
	}

	// Remaining case: steps{} has IDs not in pinned_step_ids but present in the
	// manifest. This is legitimate growth — the manifest gained steps since the
	// last generation. The ratchet absorbs them on regenerate, so this passes.
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

// Read the floor from git (merge-base, with HEAD fallback) so a contributor
// cannot lower it in the same commit.
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

// Integrity pre-check: the existing reference must have
// pinned_step_ids ⊆ steps{}. This catches manual tampering.
assertIntegrity(
	existingRef.pinned_step_ids ?? [],
	existingRef.steps ?? {},
	steps,
);

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

// Integrity post-check: the new pinned_step_ids must be a subset of
// steps{}. steps{} is derived from the manifest (reference), and
// pinned_step_ids is the ratchet floor. Extra steps in steps{} that
// exist in the manifest are legitimate growth.
assertIntegrity(newPinned, reference, steps);

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
		'The floor is derived from the merge-base of origin/develop and HEAD (the',
		'last reviewed-and-merged state of the target branch), not from HEAD or the',
		'working tree. This prevents a contributor from lowering pinned_step_ids in',
		'the same commit as a step removal — in a PR, HEAD IS the attacker commit.',
		'Enforcement (check-ci-drift.ts) refuses to run if the merge-base cannot be',
		'resolved. Generation falls back to HEAD (still committed) when the',
		'merge-base is unavailable (e.g., local without fetched origin/develop).',
		'',
		'pinned_step_ids is a subset of steps{}. A pinned step dropped from',
		'steps{} is a floor-lowering attack. Extra steps in steps{} that exist',
		'in ci-gate-manifest.json are legitimate growth (the ratchet absorbs',
		'them). Extra steps NOT in the manifest are phantom steps — tampering.',
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
