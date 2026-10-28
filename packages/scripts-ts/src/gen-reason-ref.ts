import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
	hashReason,
	manifestPath,
	readReasonRefFromMergeBase,
	readRemovalsConfession,
	reasonRefPath,
	removalsPath,
} from './reason-guard-shared.ts';

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
// If the merge-base cannot be resolved (no origin/develop, not a repo, brand
// new branch with no common ancestor), the script REFUSES TO RUN. It must
// never fall back to HEAD. A generator that degrades to "trust HEAD" when the
// merge-base fails is a generator that silently lowers the floor exactly when
// the attack succeeds — the round-7 lesson, re-learned the hard way: a
// ratchet floor read from HEAD is not a ratchet floor at all. This is the
// same loud-failure contract the enforcement (check-ci-drift.ts) already
// honors; the generator must agree, otherwise an attacker can run the
// generator locally (no fetched origin) to lower the floor, commit the
// regeneration, and push — the enforcement then sees HEAD agree with the
// removal and the ratchet stays green.
//
// To deliberately lower the floor (for first-run, recovery, or a brand-new
// repository), the human must fetch origin/develop (or set up a local
// `origin` ref that points at the right base commit) so the merge-base
// resolves. The script will not paper over a missing base.
//
// A deleted reference file is either first-generation (the file was never
// committed) or a deletion attack. After fixing the merge-base read to fail
// loud, this script refuses before ever looking at HEAD or the working tree.
// The caller (a human with a fetched base) never has to distinguish those
// cases here; both are caught by the same loud-failure path.
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

/**
 * Reads the ratchet floor (`pinned_step_ids`) from the merge-base of
 * origin/develop and HEAD. The mechanics and the full "why not HEAD / why the
 * merge-base / loud failure" rationale live in reason-guard-shared.ts together
 * with the enforcement's identical read — the generator must not be able to
 * lower a floor the enforcement still enforces.
 */
const readFloorFromGit = async (rootDir: string): Promise<string[]> => {
	const parsed = await readReasonRefFromMergeBase(rootDir, 'Generator');

	return parsed.pinned_step_ids ?? [];
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
			`Integrity check failed: pinned_step_ids has ${missingFromSteps.length} ID(s) missing from steps{}: ${missingFromSteps.map((id) => `"${id}"`).join(', ')}. A pinned step was removed from tracking — the reference file has been tampered with (floor-lowering attack). Restore it with \`git checkout HEAD -- ${reasonRefPath}\` and re-run.`,
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
			`Integrity check failed: steps{} has ${phantomFromPinned.length} ID(s) not present in ci-gate-manifest.json: ${phantomFromPinned.map((id) => `"${id}"`).join(', ')}. These phantom steps were inserted into the reference file — the file has been tampered with. Remove them manually or restore with \`git checkout HEAD -- ${reasonRefPath}\` and re-run.`,
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
				reason_hash: hashReason(entry.reason),
				reason: entry.reason,
			},
		]),
);

// --- Ratchet floor: read existing pinned IDs and removals confession ---

// Read the floor from git (merge-base, refusing to run when unavailable) so a
// contributor cannot lower it in the same commit.
const existingPinned: string[] = await readFloorFromGit(process.cwd());

// Read the existing reference file for the integrity pre-check.
let existingRef: ReasonRefFile = {};
try {
	const existingRefRaw = await readFile(
		path.resolve(process.cwd(), reasonRefPath),
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
// vanished from the manifest.
//
// A confession naming a step that is STILL present in the manifest is a
// contradiction, not a harmless no-op: the confession file exists only to
// authorize REMOVING a step from the floor, so confessing a step that is
// still covered cannot lower anything — it quietly asserts a removal that
// did not happen. A warning nobody reads and a silence have the same value,
// so the generator refuses loudly: the contributor must either delete the
// confession entry (the step was not removed) or actually remove the step
// from the manifest (and CI) if that was the real intent. Without this the
// confession file can rot into a permanent "pre-confessed" state that
// desensitizes the removal path.
const newStepIds = Object.keys(steps);
const newStepIdSet = new Set(newStepIds);
for (const step of confession?.steps ?? []) {
	if (newStepIdSet.has(step.step_id)) {
		throw new Error(
			`Confession error in ${removalsPath}: "${step.step_id}" is confessed as removed but is still present in ci-gate-manifest.json. A confession exists ONLY to authorize removing a step from the pinned floor; a confession for a step that is still reconciled is a silent no-op that hides coverage without removing it. Delete the confession entry, or remove the step from the manifest (and CI) if removal was the intent.`,
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
// (A confession naming a present step already threw above, so by this point
// every confessed id is absent from the manifest and safe to drop.)
for (const id of confessedIds) {
	if (!newStepIds.includes(id)) {
		newPinnedSet.delete(id);
	}
}

const newPinned = [...newPinnedSet].sort();

// Pin completeness (#1809 r13): the floor we are about to WRITE must pin
// every step that is currently reconciled in the manifest. The union above
// makes this true by construction, but the invariant must be ASSERTED, not
// incidental — a future refactor of the union logic that dropped a manifest
// step from the pin set would otherwise regenerate a floor that leaves the
// step covered-in-name-only, and nobody would know. The runtime counterpart
// (check-ci-drift.ts) enforces the same invariant against the committed
// reference; this assertion guarantees the generator never produces a file
// that would fail it.
const unpinnedSteps = Object.keys(steps).filter((id) => !newPinnedSet.has(id));
if (unpinnedSteps.length > 0) {
	throw new Error(
		`Integrity check failed: ${unpinnedSteps.length} reconciled step(s) in ci-gate-manifest.json would be left unpinned: ${unpinnedSteps.map((id) => `"${id}"`).join(', ')}. Every step covered by the manifest must appear in pinned_step_ids — a covered step that nothing pins can vanish without the ratchet moving. Fix the generation logic (the pin set is the union of the existing floor and the manifest) and re-run.`,
	);
}

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
		'  reason_hash - SHA-256 (first 16 hex chars) of the reason text.',
		'  reason      - the full reason text itself.',
		'',
		'The reason text is stored in full so that regenerating this file is',
		'visible in the diff: a reviewer sees the actual reason text, not just a',
		'hash and length. This closes the #1736 bypass where a 24-character bogus',
		'reason + regenerated ref was invisible in the diff.',
		'',
		'After JSON.parse, escape sequences like \\u2014 are already decoded to their',
		'UTF-8 characters, so no normalization step is needed.',
		'',
		'The guard fails when a reason changes (especially SHRINKS) while the step hash',
		'is unchanged. A deliberate rewrite is possible by regenerating this file',
		'in the same commit as the manifest change — same mechanism as the complexity',
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
		'resolved, and so does generation: gen-reason-ref.ts exits non-zero without',
		'touching this file when the merge-base is unavailable (e.g., local without',
		'fetched origin/develop). It never falls back to HEAD or the working tree.',
		'',
		'pinned_step_ids is a subset of steps{}. A pinned step dropped from',
		'steps{} is a floor-lowering attack. Extra steps in steps{} that exist',
		'in ci-gate-manifest.json are legitimate growth (the ratchet absorbs',
		'them). Extra steps NOT in the manifest are phantom steps — tampering.',
		'',
		'pinned_step_ids also covers every step in ci-gate-manifest.json',
		'(completeness, #1809 r13): a step that is reconciled but not pinned is',
		'a floor with a hole — its removal needs no confession and trips no',
		'RATCHET. check-ci-drift.ts emits an UNPINNED finding for any such step,',
		'and gen-reason-ref.ts asserts the generated floor is complete. This',
		"closes the r13 defect where the retired docs archive workflow's",
		'prune-inventory guard fixture tests sat covered but unpinned.',
		'',
		'Regenerate with: node packages/scripts-ts/src/gen-reason-ref.ts',
		'See docs/guides/local-ci-gate.md.',
	],
	pinned_step_ids: newPinned,
	steps: reference,
};

const json = JSON.stringify(output, null, '\t') + '\n';
await writeFile(path.resolve(process.cwd(), reasonRefPath), json, 'utf8');
console.log(
	`Regenerated ${reasonRefPath} with ${Object.keys(reference).length} reason fingerprints (${newPinned.length} pinned).`,
);
