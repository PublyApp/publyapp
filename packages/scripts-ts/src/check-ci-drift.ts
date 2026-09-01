import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { parse } from 'yaml';

const execFileAsync = promisify(execFile);

// Drift guard for the local CI gate (`just ci` / `just ci-full`).
//
// WHAT THIS GUARD ACTUALLY PROVES
// -------------------------------
// It proves ONE property, mechanically: every step in .github/workflows has been
// consciously reconciled against the local gate, and any change to a step — new,
// renamed, edited, or removed — fails the build until a human re-reconciles it.
//
// WHAT IT DOES NOT PROVE
// ----------------------
// It does NOT prove that a local target is semantically equivalent to the CI
// step it claims to mirror. That claim lives in the manifest's `mirror` field
// and is a HUMAN ASSERTION, reviewed like any other code. No parser can decide
// whether `just test-api` "is" some shell snippet, and a guard that pretended
// otherwise (e.g. by grepping the justfile for fragments of the `run:` block)
// would produce confident green on a mirror that had quietly stopped matching.
// That is the exact failure mode this file exists to prevent, so it is not
// simulated here.
//
// The honest mechanism is therefore a HASH-PINNED RECONCILIATION MANIFEST:
// content-address every CI step, and force the assertion to be re-made whenever
// the thing it was asserted about changes. Silent drift becomes loud drift.
//
// See docs/guides/local-ci-gate.md for the full rationale.

const workflowsDirectory = '.github/workflows';
const manifestPath = 'packages/scripts-ts/src/ci-gate-manifest.json';
const removalsPath = 'packages/scripts-ts/src/ci-gate-removals.json';

// Matches the reviewable-reason bar this repo already enforces on lint
// suppressions (see the sibling guard in scripts/). "n/a" is not a reason.
const minimumReasonLength = 24;

/**
 * How long a single repeated block may be and still count as padding.
 * Blocks longer than this are prose, not a repetition cycle an automated
 * padder would use. Anything between 24 and this limit is already caught by
 * `isFiller` when the whole string is one repetition; the limit exists to
 * bound the scan of multi-block compositions.
 */
const maxFillerBlockLength = 8;

/**
 * Length of the non-repetitive residue after greedily stripping maximal
 * repetition runs from `text`. A run is a short block (at most
 * `maxFillerBlockLength` chars) repeated at least twice, optionally followed
 * by a truncated final repetition of the same block. Runs are consumed
 * longest-first at each position; scanning stops at the first position with
 * no valid run. The residue is what remains — 0 when the whole string is
 * padding, and close to `text.length` for ordinary prose.
 */
const fillerResidueLength = (text: string): number => {
	const length = text.length;
	let position = 0;
	while (position < length) {
		let bestEnd = 0;
		const maxPeriod = Math.min(
			maxFillerBlockLength,
			Math.floor((length - position) / 2),
		);
		for (let period = 1; period <= maxPeriod; period++) {
			// Maximal end of the prefix that repeats text[position..position+period).
			let end = position + period;
			while (
				end < length &&
				text[end] === text[position + ((end - position) % period)]
			) {
				end++;
			}
			// A run needs at least two full repetitions; the truncated tail is
			// already included in `end`.
			if (end - position >= 2 * period && end > bestEnd) {
				bestEnd = end;
			}
		}
		if (bestEnd === 0) {
			break;
		}
		position = bestEnd;
	}
	return length - position;
};

/**
 * A reason is filler when it carries no information — repeated blocks padded
 * to clear the length bar. This covers a single repeated block (`"x".repeat(24)`,
 * `"xy".repeat(12)`, `"x ".repeat(11) + "x"`), a multi-block composition
 * (`"ab".repeat(6) + "cd".repeat(6)` — the r13 measured bypass), three-block
 * stacks, and a run followed by a single stray character (`"a".repeat(23) + "b"`).
 * Such a string is not a reviewable justification; it is a bypass of the
 * quality bar. We reject it regardless of length when the non-repetitive
 * residue is at most one character — a text that is (almost) entirely
 * short-block repetition is hollow no matter how the blocks are stacked.
 */
const isFiller = (text: string): boolean => {
	if (text.length === 0) {
		return false;
	}
	return fillerResidueLength(text) <= 1;
};

const toPosixPath = (value: string) => value.split(path.sep).join('/');

/**
 * Content-addresses a reason string using the same scheme as the reference
 * file (SHA-256, first 16 hex chars). The reason text is used as-is — after
 * `JSON.parse`, escape sequences like `\u2014` are already decoded to their
 * UTF-8 characters, so no normalization step is needed.
 */
export const hashReason = (text: string) =>
	createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * Reads the reason reference file from the merge-base of origin/develop and
 * HEAD — not from HEAD directly, and not from the working tree.
 *
 * WHY NOT HEAD? (the r7 defect that this supersedes)
 * The round-7 fix read the reference from `git show HEAD:...`. That breaks an
 * UNCOMMITTED working-tree edit, but NOT a COMMITTED one: in a PR, HEAD IS the
 * attacker's commit. A contributor who deletes a CI step, deletes its manifest
 * entry, AND deletes the id from `pinned_step_ids` — all in one commit — makes
 * HEAD agree with the removal. The guard comparing its floor to itself sees
 * nothing and stays green.
 *
 * WHY THE MERGE-BASE IS THE FLOOR
 * The floor must come from the last reviewed-and-merged state of the target
 * branch, i.e. what DEVELOP looked like before this PR's changes were applied.
 * `git merge-base origin/develop HEAD` finds that shared ancestor commit. The
 * reference read from THAT commit is the floor the ratchet enforces — it
 * predates the attacker's removal, so the vanished step id is still pinned and
 * the guard cries RATCHET.
 *
 * LOUD FAILURE MODE
 * If the merge-base cannot be resolved — no git, not a repo, no origin/develop,
 * a brand-new branch with no common ancestor — the guard REFUSES TO RUN. It must
 * never fall back to HEAD or the working tree. A guard that degrades to
 * "trust HEAD/the working tree" on error is a guard that turns green exactly
 * when the attack succeeds.
 */
const refFileName = 'packages/scripts-ts/src/reason-guard-ref.json';

/**
 * Reads the ratchet floor from the merge-base of origin/develop and HEAD —
 * not from HEAD directly, and not from the working tree.
 *
 * WHY NOT HEAD? (the r7 defect that this supersedes)
 * The round-7 fix read the reference from `git show HEAD:...`. That breaks an
 * UNCOMMITTED working-tree edit, but NOT a COMMITTED one: in a PR, HEAD IS the
 * attacker's commit. A contributor who deletes a CI step, deletes its manifest
 * entry, AND deletes the id from `pinned_step_ids` — all in one commit — makes
 * HEAD agree with the removal. The guard comparing its floor to itself sees
 * nothing and stays green.
 *
 * WHY THE MERGE-BASE IS THE FLOOR
 * The floor must come from the last reviewed-and-merged state of the target
 * branch, i.e. what DEVELOP looked like before this PR's changes were applied.
 * `git merge-base origin/develop HEAD` finds that shared ancestor commit. The
 * reference read from THAT commit is the floor the ratchet enforces — it
 * predates the attacker's removal, so the vanished step id is still pinned and
 * the guard cries RATCHET.
 *
 * LOUD FAILURE MODE
 * If the merge-base cannot be resolved — no git, not a repo, no origin/develop,
 * a brand-new branch with no common ancestor — the guard REFUSES TO RUN. It must
 * never fall back to HEAD or the working tree. A guard that degrades to
 * "trust HEAD/the working tree" on error is a guard that turns green exactly
 * when the attack succeeds.
 */
const readRatchetFloorFromGit = async (rootDir: string): Promise<ReasonRef> => {
	// Step 1: resolve the merge-base between origin/develop and HEAD.
	let mergeBase: string;
	try {
		const { stdout } = await execFileAsync(
			'git',
			['merge-base', 'origin/develop', 'HEAD'],
			{ cwd: rootDir, encoding: 'utf8' },
		);
		mergeBase = stdout.trim();
	} catch (error) {
		throw new Error(
			`CI drift guard REFUSING TO RUN: could not resolve \`git merge-base origin/develop HEAD\` in ${rootDir}. ` +
				`The ratchet floor is read from the merge-base commit (the last reviewed state of origin/develop), and this command failed. ` +
				`Re-run from inside a git repository that has origin/develop available (fetch it first if needed). ` +
				`The guard never falls back to HEAD or the working tree — a floor that degrades to "trust the attacker's commit" is no floor at all. ` +
				`Original error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (mergeBase === '') {
		throw new Error(
			`CI drift guard REFUSING TO RUN: \`git merge-base origin/develop HEAD\` returned empty (no common ancestor). ` +
				`This happens when the branch has no shared history with origin/develop, or origin/develop does not exist locally. ` +
				`The ratchet floor must come from the merge-base — the last reviewed-and-merged state of the target branch — not from HEAD (which in a PR IS the attacker's commit) or the working tree (which an uncommitted edit can lower). ` +
				`Fetch origin/develop and re-run, or verify the branch is based on origin/develop.`,
		);
	}

	// Step 2: read the committed reference from that merge-base commit.
	try {
		const { stdout } = await execFileAsync(
			'git',
			['show', `${mergeBase}:${refFileName}`],
			{ cwd: rootDir, encoding: 'utf8' },
		);

		return JSON.parse(stdout) as ReasonRef;
	} catch (error) {
		throw new Error(
			`Could not read reason-guard-ref.json from the merge-base commit ${mergeBase} (git merge-base origin/develop HEAD) — the ratchet floor must be derived from the committed reference at that commit, not the working tree. ` +
				`Re-run from inside a git repository where reason-guard-ref.json exists at that commit. ` +
				`Original error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

/**
 * Reads the reason reference from git HEAD (committed, not working-tree) for
 * the reason-guard comparison. The reason guard verifies that a manifest
 * entry's `reason` text hasn't been silently truncated or altered. Legitimate
 * reason rewrites are authorized by regenerating reason-guard-ref.json in the
 * SAME commit as the manifest change — so both must be at HEAD. Reading from
 * HEAD (not the working tree) closes the uncommitted-edit bypass for the reason
 * guard, while the ratchet floor is separately read from the merge-base to
 * close the committed-attack bypass for pinned_step_ids.
 */
const readRefFromGit = async (rootDir: string): Promise<ReasonRef> => {
	try {
		const { stdout } = await execFileAsync(
			'git',
			['show', `HEAD:${refFileName}`],
			{ cwd: rootDir, encoding: 'utf8' },
		);

		return JSON.parse(stdout) as ReasonRef;
	} catch (error) {
		throw new Error(
			`Could not read reason-guard-ref.json from git HEAD — the reason guard requires the committed reference, not the working tree. ` +
				`Re-run from inside a git repository with a committed reason-guard-ref.json. ` +
				`Original error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};
// hash is unchanged. The reference file (`reason-guard-ref.json`) holds the
// known-good fingerprint; any deviation while the step itself hasn't changed
// fails the guard. A deliberate rewrite is possible by updating the reference
// in the same commit — same mechanism as the complexity ceilings.
//
// The guard distinguishes three situations:
//   1. entry in manifest, absent from reference → FAIL (new entry, regenerate ref)
//   2. entry in reference, absent from manifest → WARN/ERROR (stale ref, clean up)
//   3. entry in both → existing behavior (detect truncation/alteration)
//
// #1736: the reference now stores the full `reason` text (not just its hash and
// length) so that regenerating the ref is visible in the diff. A ref that has
// been tampered with — e.g. a hash changed to match a bogus reason while the
// stored text remains the original — is caught by the main comparison:
// hashReason(entry.reason) produces a value that no longer matches the tampered
// reason_hash, so the existing reason CHANGED finding fires.
//
// #1841 (round 2): the internal consistency check
// (hashReason(stepRef.reason) !== stepRef.reason_hash) was removed after
// round 1 claimed it was redundant with the main comparison.
//
// #1841 (round 3): RESTORED. The two checks verify DIFFERENT invariants:
//   (A) Main comparison: hashReason(entry.reason) vs stepRef.reason_hash
//       → detects: manifest reason differs from ref fingerprint
//   (B) Internal consistency: hashReason(stepRef.reason) vs stepRef.reason_hash
//       → detects: ref itself is inconsistent (text A but hash B)
//
// The bypass that proves both are needed:
//   - manifest.reason = B (bogus reason)
//   - stepRef.reason = A (original text, NOT updated)
//   - stepRef.reason_hash = hashReason(B) (updated to match bogus reason)
//
// Result: entry.reason = B hashes to hashReason(B) = stepRef.reason_hash → no finding (A).
//
// Without check (B), the guard passes silently: the diff shows only the hash changing,
// which is meaningless to a human reviewer. The human cannot see that reason TEXT did
// not change (because check (B) would have fired).
//
// With check (B), hashReason(A) !== hashReason(B) → finding (B) fires, naming that
// the ref itself is internally inconsistent: its stored text does not match its own hash.
// This is exactly what #1736 set out to prevent — a bypass that makes reason change
// invisible to the human reviewer.
const getReasonGuardProblem = (
	id: string,
	entry: { hash: string; mirror: string | null; reason: string },
	ref: {
		steps: Record<string, { reason_hash: string; reason: string }>;
	},
): string | null => {
	const stepRef = ref.steps[id];

	// Case 1: manifest entry has no reference fingerprint. A brand-new step
	// was added to the manifest but the reference was not regenerated, so
	// its reason has no known-good baseline. Fail closed and tell the user
	// to regenerate.
	if (stepRef === undefined) {
		return `${manifestPath}: entry "${id}" is present in the manifest but missing from reason-guard-ref.json — new entry without a reference fingerprint. Regenerate reason-guard-ref.json in the same commit so the reason is consciously pinned (run \`node packages/scripts-ts/src/gen-reason-ref.ts\`).`;
	}

	// Validate the reference entry's shape before hashing. An entry that is
	// missing the `reason` text field (e.g. a pre-#1736 ref format, or a
	// manually edited ref) must fail LOUDLY by naming the problem — never
	// crash inside hashReason with TypeError, never fall back to a compliant
	// default. A malformed entry is a finding, not an exception. The empty
	// string is a distinct case: it passes the typeof check but pins nothing,
	// so it gets its own wording (#1870) instead of the generic "missing".
	if (stepRef.reason === undefined || typeof stepRef.reason !== 'string') {
		return `${manifestPath}: entry "${id}" reason-guard-ref.json is missing the \`reason\` text field (got ${stepRef.reason === undefined ? 'undefined' : typeof stepRef.reason}). The reference must store the full reason text so regeneration is visible in the diff; regenerate it with \`node packages/scripts-ts/src/gen-reason-ref.ts\`.`;
	}
	if (stepRef.reason.length === 0) {
		return `${manifestPath}: entry "${id}" reason-guard-ref.json has an EMPTY \`reason\` text field (length 0). An empty reason pins nothing; the reference must store the full reason text so regeneration is visible in the diff; regenerate it with \`node packages/scripts-ts/src/gen-reason-ref.ts\`.`;
	}

	// (B) Internal consistency check: the stored reason text must match its own
	// stored hash. If they diverge, the ref was hand-edited in a way that breaks
	// the fingerprint contract — either the text was changed without updating
	// the hash, or the hash was set to match a different text than what is stored.
	// This detects the #1736 bypass: writing a bogus reason, updating only the hash
	// to match, and leaving the original text in place so the diff stays invisible.
	// hashReason(stepRef.reason) === stepRef.reason_hash when the ref is consistent.
	const refTextHash = hashReason(stepRef.reason);

	if (refTextHash !== stepRef.reason_hash) {
		return `${manifestPath}: entry "${id}" reason-guard-ref.json is internally inconsistent — stored reason text hashes to ${refTextHash} but stored reason_hash is ${stepRef.reason_hash}. The reference text and its fingerprint do not match; regenerate it with \`node packages/scripts-ts/src/gen-reason-ref.ts\` to restore consistency.`;
	}

	const currentHash = hashReason(entry.reason);

	if (currentHash === stepRef.reason_hash) {
		return null;
	}

	const currentLength = entry.reason.length;
	// The stored reason TEXT is the baseline — a separately stored
	// `reason_length` echo would be checked by no downstream code and could
	// only lie about the SHRINK/CHANGED numbers (#1870).
	const expectedLength = stepRef.reason.length;

	if (currentLength < expectedLength) {
		return `${manifestPath}: entry "${id}" reason SHRINK from ${expectedLength} to ${currentLength} characters while the step hash is unchanged (expected reason hash ${stepRef.reason_hash}, got ${currentHash}). Truncation is not a rewrite — restore the original reason, or regenerate reason-guard-ref.json in the same commit if the rewrite is deliberate (run \`node packages/scripts-ts/src/gen-reason-ref.ts\`).`;
	}

	return `${manifestPath}: entry "${id}" reason CHANGED (expected hash ${stepRef.reason_hash}, got ${currentHash}; expected ${expectedLength} chars, got ${currentLength}) while the step hash is unchanged. If this is a deliberate rewrite, regenerate reason-guard-ref.json in the same commit so the reference matches the new reason — run \`node packages/scripts-ts/src/gen-reason-ref.ts\` to regenerate it.`;
};

/**
 * Reads and validates the removals confession file.
 * Returns null when the file does not exist (no confession).
 * Throws when the file exists but is malformed — a malformed confession must
 * never silently lower the floor.
 *
 * Validation rules:
 *   - The file must be valid JSON.
 *   - It must be an object with a `steps` array.
 *   - Each entry must have a non-empty `step_id` and a `reason` of at least
 *     24 characters (aligned with the repo's existing bar on lint suppressions).
 */
const readRemovalsConfession = async (
	rootDir: string,
): Promise<RemovalsConfession | null> => {
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

	const steps: RemovalsConfession['steps'] = [];
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
				`Confession file ${removalsPath}: entry "${stepId}" has a reason that is filler (repeated short blocks — a single repeated character, a cycle, a repeated pair, or a stack of them). A valid confession must be a reviewable justification naming what was lost and why — filler is not a reason.`,
			);
		}

		steps.push({ step_id: stepId, reason, removed_at: removedAt });
	}

	return { steps };
};

/**
 * Ratchet floor check (#1709).
 *
 * The reference file (`reason-guard-ref.json`) holds a `pinned_step_ids` array
 * that grows monotonically — regeneration can only ADD to it, never remove.
 * This breaks the 3-step attack where a covered step is deleted from CI, then
 * from the manifest, then the reference is regenerated to match.
 *
 * This function checks every pinned step ID against the current manifest. A
 * pinned step that is missing from the manifest is either:
 *   - LEGITIMATE: named in the removals confession file (`ci-gate-removals.json`)
 *     with a reason — the human deliberately removed it and confessed why.
 *   - SILENT ERASSING: missing without confession — the ratchet fails closed.
 *
 * The confession file is the ONLY way to lower the floor, and it must name the
 * step explicitly. This makes deliberate removal possible but never an accident
 * disguised as cleanup.
 */
const getRatchetProblems = async (
	rootDir: string,
	entries: Record<string, unknown>,
	ref: ReasonRef,
): Promise<string[]> => {
	const findings: string[] = [];

	let confession: RemovalsConfession | null;
	try {
		confession = await readRemovalsConfession(rootDir);
	} catch (error) {
		// A malformed confession file must never silently lower the floor.
		// Report it as a named finding so the guard fails loudly.
		findings.push(
			`CONFESSION ERROR\n    The confession file ${removalsPath} is malformed and cannot be parsed: ${error instanceof Error ? error.message : String(error)}. Fix the confession file — a malformed confession cannot be accepted as a reason to lower the floor.`,
		);
		return findings;
	}

	// A confession naming a step that is STILL reconciled in the manifest is a
	// contradiction, not a no-op: the confession file exists only to authorize
	// REMOVING a step from the floor, so confessing a step that is still
	// covered cannot lower anything — it quietly asserts that the step is gone
	// while the manifest keeps protecting it. A warning nobody reads and a
	// silence have the same value, so this is a hard finding: the contributor
	// must either delete the confession entry (the step was not removed) or
	// actually remove the step from CI and the manifest (if that was the real
	// intent). Without this check the confession file can rot into a permanent
	// "pre-confessed" state that desensitizes the removal path. It runs before
	// the ratchet's early return because it validates the confession itself,
	// not the floor.
	const confessedIds = new Set(confession?.steps.map((s) => s.step_id) ?? []);

	for (const id of confessedIds) {
		if (!(id in entries)) {
			continue;
		}

		findings.push(
			`CONFESSION CONTRADICTION  ${id}\n    ci-gate-removals.json confesses the removal of "${id}", but the step is still reconciled in the manifest. A confession exists ONLY to authorize removing a step from the floor; a confession for a step that is still covered has no effect and quietly asserts a removal that did not happen. Delete the confession entry (the step was not removed), or actually remove the step from CI and the manifest if that was the intent.`,
		);
	}

	const pinned = ref.pinned_step_ids ?? [];

	if (pinned.length === 0) {
		return findings;
	}

	for (const id of pinned) {
		if (id in entries) {
			continue;
		}

		if (confessedIds.has(id)) {
			continue;
		}

		findings.push(
			`RATCHET  ${id}\n    A CI step that was reconciled and pinned in reason-guard-ref.json has vanished from the manifest without a confession. A covered verification step was silently erased — either restore the step and its manifest entry, or confess the removal in ${removalsPath} with a reason naming what was lost and why (see docs/guides/local-ci-gate.md).`,
		);
	}

	return findings;
};

const normalizeCommand = (value: string) =>
	String(value)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/[ \t]+$/, ''))
		.join('\n')
		.replace(/^\n+/, '')
		.replace(/\n+$/, '');

/**
 * Serializes a value with deterministic key ordering so the hash depends only
 * on content, never on YAML authoring order.
 */
const toStableJson = (value: unknown): string => {
	if (Array.isArray(value)) {
		return `[${value.map(toStableJson).join(',')}]`;
	}

	if (value !== null && typeof value === 'object') {
		const keys = Object.keys(value).sort();
		const body = keys
			.map(
				(key) =>
					`${JSON.stringify(key)}:${toStableJson((value as Record<string, unknown>)[key])}`,
			)
			.join(',');

		return `{${body}}`;
	}

	return JSON.stringify(value ?? null);
};

// --- Minimal YAML structural types (parsed, untyped at runtime) ---

interface YamlStep {
	name?: string;
	run?: string;
	uses?: string;
	env?: Record<string, string>;
	if?: string;
	continue_on_error?: boolean;
	with?: Record<string, unknown>;
}

interface YamlJob {
	steps?: YamlStep[];
	if?: string;
}

interface YamlDocument {
	jobs?: Record<string, YamlJob>;
}

/**
 * Content-addresses everything about a step that decides what it does: the
 * command or action, the inputs handed to it, the environment it reads, the
 * condition that gates it, and whether its own failure is allowed to be
 * masked. A change to any of these can invalidate the local mirror, so all
 * of them belong in the hash.
 *
 * `continue-on-error` is included because it is behavioral, not cosmetic: a
 * review round proved that adding `continue-on-error: true` to a real
 * verification step makes the job (and therefore the required gate) report
 * success after that step fails, while every existing test stayed green.
 * Hashing it forces a manifest reconciliation for ANY step that gains or
 * loses it, everywhere in .github/workflows — not only inside the
 * verification jobs scripts/check-ci-gate-structure.mjs hard-rejects it in.
 */
const hashStep = (step: YamlStep) => {
	const payload = {
		'continue-on-error': step.continue_on_error ?? null,
		env: step.env ?? null,
		if: step.if ?? null,
		run: 'run' in step ? normalizeCommand(step.run as string) : null,
		uses: step.uses ?? null,
		with: step.with ?? null,
	};

	return createHash('sha256')
		.update(toStableJson(payload))
		.digest('hex')
		.slice(0, 16);
};

/**
 * Builds an identity that survives step reordering and action version bumps,
 * because those are not drift in the "the local gate is now wrong" sense.
 *
 * A `uses:` version bump changes the HASH (so it is still surfaced for review)
 * but not the identity, which keeps the manifest diff readable instead of
 * churning a delete + add pair on every Dependabot bump.
 */
const getStepLabel = (step: YamlStep, index: number): string => {
	if (typeof step.name === 'string' && step.name.trim().length > 0) {
		return step.name.trim();
	}

	if (typeof step.uses === 'string') {
		return `uses:${step.uses.split('@')[0]}`;
	}

	return `step#${index}`;
};

/**
 * Flattens every workflow into a list of identified, hashed steps.
 *
 * Both `run:` and `uses:` steps are tracked. Tracking only `run:` steps would
 * leave a hole: a new `uses:` step can perform real verification (a linting or
 * scanning action), and the gate must be forced to account for it rather than
 * ignore it by category.
 */
const collectWorkflowSteps = async (rootDir: string) => {
	const steps: { hash: string; id: string; kind: 'run' | 'uses' }[] = [];
	const problems: string[] = [];

	const { files, errorFinding } = await listWorkflowFiles(rootDir);
	if (errorFinding !== null) {
		problems.push(errorFinding);
		return { problems, steps };
	}

	for (const file of files) {
		const raw = await readFile(
			path.join(rootDir, workflowsDirectory, file),
			'utf8',
		);
		const document = parse(raw) as YamlDocument | null;
		const jobs = document?.jobs ?? {};

		for (const jobId of Object.keys(jobs).sort()) {
			const job = jobs[jobId];
			const jobSteps: YamlStep[] = job?.steps ?? [];
			const seenLabels = new Set<string>();

			for (const [index, step] of jobSteps.entries()) {
				const label = getStepLabel(step, index);
				const id = `${file}::${jobId}::${label}`;

				// Fail closed. Two steps sharing an identity would let one of them
				// hide behind the other's manifest entry forever.
				if (seenLabels.has(label)) {
					problems.push(
						`${file}: job "${jobId}" has two steps labelled "${label}". Give them distinct \`name:\` values so each can be reconciled independently.`,
					);
					continue;
				}

				seenLabels.add(label);
				steps.push({
					hash: hashStep(step),
					id,
					kind: 'run' in step ? 'run' : 'uses',
				});
			}
		}
	}

	return { problems, steps };
};

/**
 * Validates one manifest entry's shape. An entry that neither names a mirror
 * nor gives a reason is not a reconciliation, it is a rubber stamp.
 */
const getEntryValidationProblem = (
	id: string,
	entry: unknown,
): string | null => {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		return `${manifestPath}: entry "${id}" must be an object.`;
	}

	const record = entry as Record<string, unknown>;

	if (typeof record.hash !== 'string' || record.hash.length === 0) {
		return `${manifestPath}: entry "${id}" is missing a \`hash\`.`;
	}

	const hasMirror =
		typeof record.mirror === 'string' && record.mirror.length > 0;

	if (!hasMirror && record.mirror !== null) {
		return `${manifestPath}: entry "${id}" must set \`mirror\` to the local command that covers it, or to null when it is exempt.`;
	}

	if (
		typeof record.reason !== 'string' ||
		record.reason.trim().length < minimumReasonLength
	) {
		return `${manifestPath}: entry "${id}" needs a \`reason\` of at least ${minimumReasonLength} characters saying ${
			hasMirror
				? 'how the mirror covers this step'
				: 'why this step cannot run locally'
		}.`;
	}

	if (isFiller(record.reason.trim())) {
		return `${manifestPath}: entry "${id}" has a reason that is filler (repeated short blocks — a single repeated character, a cycle, a repeated pair, or a stack of them). A reviewable reason must name what the mirror covers or why the step cannot run locally — filler is not a reason.`;
	}

	return null;
};

/**
 * Scans the raw JSON text of the manifest for duplicate keys within the same
 * object. `JSON.parse` silently keeps the LAST occurrence of a duplicate key,
 * producing a false-negative: a manifest that parses without error while
 * silently discarding a reconciled step. This guard reads the text directly,
 * at the brace/quote level, and names every duplicate key with its line numbers.
 *
 * The parser is a minimal state machine: it tracks string contexts (so braces
 * and colons inside string values are not mistaken for structural tokens) and
 * a stack of key maps — one per open `{`. A key inside `"..."` followed by `:`
 * is checked against the current object's map; if it was already seen, it is a
 * duplicate.
 *
 * @param raw - The raw JSON text of ci-gate-manifest.json.
 * @returns An array of human-readable findings (empty when no duplicates).
 */
export const findDuplicateKeys = (raw: string): string[] => {
	const findings: string[] = [];
	const lines = raw.split('\n');

	// Stack of Maps: one per open object, mapping key -> first-seen line index.
	const keyStack: Map<string, number>[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		for (let j = 0; j < line.length; j++) {
			const char = line[j];

			if (char === '"') {
				// Try to read a key: "..." followed by optional whitespace then `:`.
				const { key, endQuote, nextIndex } = readJsonKey(line, j);

				if (key !== null) {
					const current = keyStack[keyStack.length - 1];

					if (current !== undefined) {
						const firstLine = current.get(key);
						if (firstLine !== undefined) {
							findings.push(
								`${manifestPath}: DUPLICATE KEY ${JSON.stringify(
									key,
								)} at lines ${firstLine + 1} and ${i + 1} — JSON.parse would silently keep only the last occurrence, masking a reconciled step that should not be lost. Delete the duplicate entry and keep the intended one.`,
							);
						} else {
							current.set(key, i);
						}
					}

					// Resume scanning just after the colon.
					j = nextIndex;
				} else {
					// This was a string value, not a key. Resume scanning just
					// after the closing quote so the loop's j++ doesn't skip it.
					j = endQuote;
				}
				continue;
			}

			if (char === '{') {
				keyStack.push(new Map());
			} else if (char === '}') {
				keyStack.pop();
			}
		}
	}

	return findings;
};

/**
 * Reads a JSON string key starting at the `"` on `line` at position `start`.
 * The string must be immediately followed by optional whitespace and `:`.
 * Returns the decoded key, or null if this quote is not a key, plus the index
 * to continue scanning from.
 */
/** What a single scan step of the manifest's raw text yields: the decoded key
 * when the position held one, and where the scanner must resume. Named rather
 * than inlined so the three return sites share one contract instead of three
 * anonymous shapes that can drift apart (`publy` no-anonymous-return-type). */
interface JsonKeyScan {
	key: string | null;
	endQuote: number;
	nextIndex: number;
}

const readJsonKey = (line: string, start: number): JsonKeyScan => {
	// Find the closing quote (handling escapes).
	let end = start + 1;
	let escape = false;

	while (end < line.length) {
		if (escape) {
			escape = false;
			end++;
			continue;
		}

		if (line[end] === '\\') {
			escape = true;
			end++;
			continue;
		}

		if (line[end] === '"') {
			break;
		}

		end++;
	}

	if (end >= line.length) {
		return { key: null, endQuote: end, nextIndex: end };
	}

	// Check if followed by optional whitespace then `:`.
	let k = end + 1;
	while (
		k < line.length &&
		(line[k] === ' ' ||
			line[k] === '\t' ||
			line[k] === '\n' ||
			line[k] === '\r')
	) {
		k++;
	}

	if (line[k] !== ':') {
		return { key: null, endQuote: end, nextIndex: k };
	}

	// Decode the key content.
	const rawKey = line.substring(start + 1, end);
	const decodedKey = decodeJsonString(rawKey);

	return { key: decodedKey, endQuote: end, nextIndex: k };
};

/**
 * Minimal JSON string decoder for escape sequences that can appear in
 * manifest keys (the step IDs themselves are plain strings, but this
 * handles the general case defensively).
 */
const decodeJsonString = (raw: string): string =>
	raw
		.replace(/\\n/g, '\n')
		.replace(/\\t/g, '\t')
		.replace(/\\r/g, '\r')
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\')
		.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);

// --- Reason reference type ---

interface ReasonRef {
	// The reference is parsed from untrusted JSON, so `pinned_step_ids` can
	// legitimately decode to `null` (a hand-tampered file). The type models
	// the boundary: `undefined` = pre-ratchet file (field absent), `null` or
	// a non-array = malformed/tampered (a named finding, never a silent skip).
	pinned_step_ids?: string[] | null;
	steps: Record<string, { reason_hash: string; reason: string }>;
}

interface RemovalsConfession {
	steps: Array<{
		step_id: string;
		reason: string;
		removed_at?: string;
	}>;
}

/**
 * Formats a JSON.parse error into a human-readable message that names the
 * cause in plain words. Never includes the raw document content (which could
 * be large or contain secrets) — only the error type and location.
 */
const formatJsonError = (error: unknown): string => {
	if (error instanceof SyntaxError) {
		// Node's JSON SyntaxError carries a "position" property in recent
		// versions; fall back to the message when unavailable.
		const position = (error as { position?: number }).position;
		if (typeof position === 'number') {
			return `syntax error at character ${position}: ${error.message}`;
		}
		return `syntax error: ${error.message}`;
	}
	return `unexpected error: ${error instanceof Error ? error.message : String(error)}`;
};

/**
 * Compares the workflows against the manifest and returns human-readable
 * findings. Returns an empty array when the gate is fully reconciled.
 *
 * Two reference sources are consulted:
 *   1. REASON REFERENCE (HEAD): reason-guard-ref.json read from git HEAD. The
 *      reason guard checks each manifest entry's `reason` text against the
 *      committed fingerprint. Legitimate reason rewrites are authorized by
 *      regenerating the reference in the SAME commit, so HEAD is the right
 *      baseline. Reading from HEAD (not the working tree) closes the
 *      uncommitted-edit bypass for the reason guard.
 *   2. RATCHET FLOOR (merge-base): pinned_step_ids read from the merge-base of
 *      origin/develop and HEAD — the last reviewed-and-merged state. This is
 *      immune to a PR author's committed edits, closing the 3-part committed
 *      attack (delete step + manifest entry + pinned id, all in one commit).
 *
 * @param {Object} options
 * @param {string} options.rootDir - Repository root directory.
 * @param {ReasonRef} [options.reasonRef] - Optional reason reference override
 *   (defaults to reading from git HEAD). Used by tests
 *   to inject a fixture reference without touching the real one.
 * @param {ReasonRef} [options.ratchetFloorRef] - Optional ratchet floor override
 *   (defaults to reading from the merge-base commit). Used by tests to inject a
 *   floor fixture.
 */
export const findCiDrift = async ({
	rootDir,
	reasonRef: reasonRefOption,
	ratchetFloorRef,
}: {
	rootDir: string;
	reasonRef?: ReasonRef;
	ratchetFloorRef?: ReasonRef;
}): Promise<string[]> => {
	const ref = reasonRefOption ?? (await readRefFromGit(rootDir));
	// If reasonRef was injected (bypassing git), use it as the floor too — tests
	// that inject a reasonRef for the reason guard don't have a git repo to read
	// the merge-base floor from. In production, both are read from git (HEAD for
	// reasons, merge-base for the ratchet floor).
	const floor =
		ratchetFloorRef ??
		(reasonRefOption ? ref : await readRatchetFloorFromGit(rootDir));
	const { problems, steps } = await collectWorkflowSteps(rootDir);
	const findings = [...problems];

	let manifestRaw: string;
	try {
		manifestRaw = await readFile(path.join(rootDir, manifestPath), 'utf8');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOENT') {
			findings.push(
				`${manifestPath}: manifest file not found at ${path.join(rootDir, manifestPath)}. The drift guard requires this manifest to verify CI step reconciliation. Create the manifest (see docs/guides/local-ci-gate.md) or ensure the file path is correct.`,
			);
		} else if (code === 'EACCES') {
			findings.push(
				`${manifestPath}: manifest file is not readable at ${path.join(rootDir, manifestPath)}. Check file permissions so the drift guard can read the manifest.`,
			);
		} else {
			findings.push(
				`${manifestPath}: could not read manifest file at ${path.join(rootDir, manifestPath)} — ${error instanceof Error ? error.message : String(error)}. Fix the file access issue and re-run.`,
			);
		}
		return findings;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(manifestRaw);
	} catch (error) {
		findings.push(
			`${manifestPath}: invalid JSON — ${formatJsonError(
				error,
			)}. The manifest document cannot be parsed, so the drift guard cannot assert anything about its keys or entries. Fix the JSON syntax error first, then re-run.`,
		);
		return findings;
	}

	if (parsed === null) {
		findings.push(
			`${manifestPath}: manifest is JSON null. The drift guard expects an object with a \`steps\` key. Replace null with a valid manifest object containing the reconciled CI steps.`,
		);
		return findings;
	}

	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		findings.push(
			`${manifestPath}: manifest is a ${
				Array.isArray(parsed) ? 'JSON array' : typeof parsed
			}, not an object. The drift guard expects a JSON object with a \`steps\` key. Replace the value with a valid manifest object containing the reconciled CI steps.`,
		);
		return findings;
	}

	const manifest = parsed as { steps?: Record<string, unknown> };

	// Detect duplicate keys BEFORE using the parsed result — JSON.parse silently
	// keeps the last occurrence, which would mask a reconciled step as missing.
	// This guard reads the raw text at the brace/quote level and names each
	// duplicate with its line numbers. Only reached when the document is a valid
	// object (see the parse + shape checks above), so a "no duplicates" finding
	// is meaningful.
	findings.push(...findDuplicateKeys(manifestRaw));

	const entries = manifest.steps ?? {};

	const seen = new Set<string>();

	for (const step of steps) {
		const entry = entries[step.id];

		if (entry === undefined) {
			findings.push(
				`NEW STEP  ${step.id}\n    CI gained a step the local gate does not account for. Either mirror it in \`just ci\` or record why it cannot run locally, then add:\n      "${step.id}": { "hash": "${step.hash}", "mirror": "<local command, or null>", "reason": "<why>" }`,
			);
			continue;
		}

		seen.add(step.id);

		const validationProblem = getEntryValidationProblem(step.id, entry);

		if (validationProblem !== null) {
			findings.push(validationProblem);
			continue;
		}

		const entryRecord = entry as {
			hash: string;
			mirror: string | null;
			reason: string;
		};

		if (entryRecord.hash !== step.hash) {
			findings.push(
				`CHANGED   ${step.id}\n    This CI step changed since it was reconciled (manifest ${entryRecord.hash}, workflow ${step.hash}).\n    Re-check that "${entryRecord.mirror ?? '(exempt)'}" still covers it, then update the hash to "${step.hash}".`,
			);
		} else {
			// Reason guard: detect truncation/alteration of a reason while the
			// step hash is unchanged. A deliberate rewrite is possible by
			// updating reason-guard-ref.json in the same commit.
			const reasonProblem = getReasonGuardProblem(step.id, entryRecord, ref);

			if (reasonProblem !== null) {
				findings.push(reasonProblem);
			}
		}
	}

	for (const id of Object.keys(entries)) {
		if (seen.has(id) || steps.some((step) => step.id === id)) {
			continue;
		}

		findings.push(
			`STALE     ${id}\n    The manifest reconciles a CI step that no longer exists. Delete the entry (and drop the local mirror if nothing else needs it).`,
		);
	}

	// Case 2: an entry exists in the reason reference but no longer has a
	// manifest entry (the step was removed from the workflow or the manifest).
	// The reference is now stale — it fingerprints a reason that no longer has
	// a manifest entry to pin. Clean it up so the reference stays a faithful
	// baseline.
	for (const id of Object.keys(ref.steps)) {
		if (id in entries) {
			continue;
		}

		findings.push(
			`STALE REF ${id}\n    The reason reference holds a fingerprint for "${id}" which is absent from the manifest. The CI step was removed; delete the reference entry by regenerating (run \`node packages/scripts-ts/src/gen-reason-ref.ts\`).`,
		);
	}

	// Ratchet floor check (#1709, r8): pinned_step_ids read from the
	// merge-base commit (not HEAD) — immune to the 3-part committed attack.
	findings.push(...(await getRatchetProblems(rootDir, entries, floor)));

	// Pin completeness (#1809 r13): every step reconciled in the manifest must
	// be pinned in the CURRENT reference (read from HEAD). The reverse
	// direction — pinned ⊆ steps ⊆ manifest — was already enforced (integrity
	// in gen-reason-ref.ts, RATCHET here), but completeness never was: a step
	// covered by the manifest could sit unpinned, protected in name only. Its
	// reason could be dropped or the step removed from the manifest later
	// without the ratchet moving — a floor with a hole nobody knows about.
	// Regeneration pins the union of the existing floor and the manifest, so
	// the only fix is to regenerate. A reference from before the ratchet
	// (no `pinned_step_ids` field) keeps the pre-ratchet meaning: the field
	// is what activates the floor, matching the RATCHET check above.
	if (ref.pinned_step_ids !== undefined) {
		// The field activates the floor; a malformed value is tampering, never
		// a silent skip. `null`, a string, or an object would crash
		// `new Set(...)` with a raw TypeError; a hand-edited reference must
		// produce a NAMED finding instead (the generator can only ever write
		// the array form, so any other shape is hand tampering). A reference
		// from before the ratchet keeps its pre-ratchet meaning (absent field
		// = floor inactive, matching the RATCHET check above).
		if (!Array.isArray(ref.pinned_step_ids)) {
			findings.push(
				`reason-guard-ref.json: \`pinned_step_ids\` must be an array of step ids (got ${ref.pinned_step_ids === null ? 'null' : typeof ref.pinned_step_ids}). The pin floor cannot be reconciled from a malformed value — regenerate reason-guard-ref.json (\`node packages/scripts-ts/src/gen-reason-ref.ts\`).`,
			);
		} else {
			const pinnedAtHead = new Set(ref.pinned_step_ids);
			for (const id of Object.keys(entries)) {
				if (pinnedAtHead.has(id)) {
					continue;
				}

				findings.push(
					`UNPINNED ${id}\n    This step is reconciled in the manifest but not pinned in reason-guard-ref.json. A covered step that nothing pins can vanish without the ratchet moving — its removal needs no confession and trips no RATCHET. Regenerate reason-guard-ref.json so every reconciled step is pinned (run \`node packages/scripts-ts/src/gen-reason-ref.ts\`).`,
				);
			}
		}
	}

	// Structural checks (#1914, #1693): hard invariants that hash-pinning
	// cannot express. They scan the parsed workflow documents directly.
	findings.push(...(await checkSmokeStepProductionEnv(rootDir)));
	findings.push(...(await checkUploadArtifactSuccessPath(rootDir)));

	return findings;
};

/**
 * Lists the workflow files in `.github/workflows`, or returns a named finding
 * naming the directory when it cannot be read. Both `checkSmokeStepProductionEnv`
 * and `checkUploadArtifactSuccessPath` rely on this; a missing, renamed, or
 * permission-denied workflows directory MUST surface a finding that names the
 * path — never silently lower the gate to "nothing to report" (the round-1
 * defect). The shape of the finding is `{ files, errorFinding }` so callers
 * can either iterate the files or push the finding.
 */
const listWorkflowFiles = async (
	rootDir: string,
): Promise<{ files: string[]; errorFinding: string | null }> => {
	const directory = path.join(rootDir, workflowsDirectory);
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const files = entries
			.filter(
				(entry) =>
					entry.isFile() &&
					(entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')),
			)
			.map((entry) => entry.name)
			.sort();
		return { files, errorFinding: null };
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		let reason: string;
		if (code === 'ENOENT') {
			reason = 'directory not found (missing or renamed)';
		} else if (code === 'EACCES') {
			reason = 'permission denied';
		} else if (error instanceof Error) {
			reason = error.message;
		} else {
			reason = String(error);
		}
		return {
			files: [],
			errorFinding: `${workflowsDirectory}: could not read workflows directory at \`${directory}\` — ${reason}. The structural guards (smoke NODE_ENV=production, upload-artifact success-path) cannot analyze anything they cannot list; fix the directory access and re-run.`,
		};
	}
};

/**
 * Classifies a step or job `if:` condition into one of three buckets:
 *   - "success-path": runs on green (no `if:`, or the expression is
 *     unambiguously success-capable).
 *   - "failure-only": only on red (the `if:` expression mentions
 *     `failure()` or `cancelled()` in any form, OR mentions the cancelled
 *     status as a conjunction operand).
 *   - "uncertain": anything else — a fork variable, a custom boolean
 *     expression, a `steps.*` derived dynamic guard, a compound expression
 *     that the guard cannot statically evaluate (e.g. `success() && false`,
 *     `always() && cancelled()`).
 *
 * #1941 round-2: the classifier must integrate the enclosing JOB's `if:`
 * as well as the step's, and recognize `cancelled()` as failure-only
 * (the previous shape classified `cancelled()` as uncertain, then ignored
 * it because no `failure()` was present — turning the whole
 * checkUploadArtifactSuccessPath guard false green).
 *
 * The classifier also recognizes ONE narrow dynamic guard as success-capable:
 * the exact form `needs.<job>.outputs.<key> == '<literal>'`. This is the
 * matrix-shard eligibility pattern front-ci.yml uses (one job per shard whose
 * `if:` is `needs.changes.outputs.relevant == 'true'`). The privilege is
 * NOT extended to `steps.<id>.outputs.<key>` (a step-output-derived dynamic
 * guard that the guard cannot statically evaluate), nor to any other
 * expression form — a guard that pretends to evaluate GitHub expressions
 * would produce confident green on a mirror that had quietly stopped
 * matching, exactly the failure mode this file exists to prevent.
 */
const classifyIfCondition = (
	condition: string,
): 'success-path' | 'failure-only' | 'uncertain' => {
	const text = condition.trim();
	if (text === '') {
		return 'success-path';
	}

	// Failure-only when the WHOLE expression is a single token from
	// {failure(), cancelled()}. A compound expression that mentions
	// `failure()` or `cancelled()` alongside another operand (e.g.
	// `always() && cancelled()`, `success() || failure()`) is a
	// contradiction the guard cannot statically evaluate; classify it
	// uncertain and surface a named finding rather than silently
	// counting it as failure-only. The bare-token check uses a strict
	// anchor at both ends so leading/trailing whitespace and parens are
	// allowed but compound operators are not.
	const bareFailureOnly = /^(?:\s*(?:failure|cancelled)\s*\(\s*\)\s*)$/.test(
		text,
	);
	if (bareFailureOnly) {
		return 'failure-only';
	}

	// THE NARROW PRIVILEGE: the exact eligibility form
	// `needs.<job>.outputs.<key> == '<literal>'` is recognized as
	// success-capable. This is the matrix-shard eligibility pattern
	// front-ci.yml uses (one job per shard whose `if:` gates on
	// needs.changes.outputs.relevant == 'true'). The privilege is NOT
	// extended to `steps.<id>.outputs.<key>` (a step-output-derived dynamic
	// guard) nor to any other dynamic expression — a guard that pretended
	// to evaluate GitHub expressions would produce confident green on a
	// mirror that had quietly stopped matching, exactly the failure mode
	// this file exists to prevent.
	if (
		/^\s*needs\.[A-Za-z0-9_-]+\.outputs\.[A-Za-z0-9_-]+\s*==\s*['"][^'"]+['"]\s*$/.test(
			text,
		)
	) {
		return 'success-path';
	}

	// success() and always() alone — but ONLY when they are the WHOLE
	// expression. A compound expression like `success() && false` or
	// `always() && cancelled()` is a contradiction that the guard cannot
	// statically evaluate; classify it uncertain and surface a named finding
	// rather than silently counting it as success-capable.
	const trimmed = text.replace(/\s+/g, '');
	if (
		trimmed === 'success()' ||
		trimmed === 'always()' ||
		/^(?:success\(\)|always\(\))$/.test(text)
	) {
		return 'success-path';
	}

	return 'uncertain';
};

// #1941 round-2: equivalent front-start command forms. The previous shape
// only recognized `pnpm --filter front start` and bare `node server.mjs`,
// missing the GitHub-recommended `pnpm --dir apps/front start` form and the
// relative-path `node ./apps/front/server.mjs` form. Both must trigger the
// NODE_ENV=production + PUBLIC_ORIGIN guard. The bare `pnpm start` family is
// retained only for the form running under `working-directory: apps/front`
// (out of scope for a guard that reads run: text — see the guide note).
const frontStartCommandPatterns: RegExp[] = [
	/\bpnpm\s+--filter\s+front\s+(?:run\s+)?start(?![\w:-])/,
	/\bpnpm\s+--dir\s+apps\/front\s+(?:run\s+)?start(?![\w:-])/,
	/\bnode\s+(?:\.\/)?apps\/front\/server\.mjs\b/,
	/\bnode\s+server\.mjs\b/,
	/\bpnpm\s+(?:run\s+)?start(?![\w:-])/,
];

const isFrontStartStep = (run: string): boolean =>
	frontStartCommandPatterns.some((pattern) => pattern.test(run));

const isUploadArtifactStep = (uses: string): boolean =>
	uses.startsWith('actions/upload-artifact@');

/**
 * #1914: The front-ci.yml smoke-start step must run with NODE_ENV=production
 * in its env block.
 *
 * #1941 round-2: the step must ALSO set a non-empty PUBLIC_ORIGIN. Without
 * it, validateRuntimeEnv() refuses to start the server (otherwise the
 * server would trust the client's Host header when building canonical and
 * Open Graph URLs), so removing PUBLIC_ORIGIN from the smoke step silently
 * breaks the production contract — every other env var can be set and the
 * step still fails to start the server. The PUBLIC_ORIGIN value just has to
 * be a non-empty string; we do not validate it as a URL because the step's
 * own curl probe (to whatever origin this step actually curls) is what
 * makes the value meaningful, and the guard cannot evaluate GitHub
 * expressions.
 */
export const checkSmokeStepProductionEnv = async (
	rootDir: string,
): Promise<string[]> => {
	const findings: string[] = [];
	const { files, errorFinding } = await listWorkflowFiles(rootDir);

	if (errorFinding !== null) {
		findings.push(errorFinding);
		return findings;
	}

	for (const file of files) {
		const raw = await readFile(
			path.join(rootDir, workflowsDirectory, file),
			'utf8',
		);
		const document = parse(raw) as YamlDocument | null;
		const jobs = document?.jobs ?? {};

		for (const jobId of Object.keys(jobs)) {
			const job = jobs[jobId];
			const jobSteps: YamlStep[] = job?.steps ?? [];

			for (const step of jobSteps) {
				const run = typeof step.run === 'string' ? step.run : '';
				if (!isFrontStartStep(run)) {
					continue;
				}

				const env = step.env ?? {};
				const stepName = step.name ?? '';
				const loc = `${file}::${jobId}::${stepName}`;

				if (env.NODE_ENV !== 'production') {
					findings.push(
						`SMOKE ENV  ${loc}\n    This step starts the front standalone server (its \`run:\` matches the front \`start\` command — \`pnpm --filter front start\`, \`pnpm --dir apps/front start\`, or \`node [./]apps/front/server.mjs\`), so it must set NODE_ENV=production in its \`env:\` block to exercise validateRuntimeEnv() on the CI smoke path. Currently NODE_ENV is absent or not "production". Without it, removing validateRuntimeEnv() from server.mjs would pass CI silently.`,
					);
				}

				const publicOrigin = env.PUBLIC_ORIGIN;
				if (typeof publicOrigin !== 'string' || publicOrigin.trim() === '') {
					findings.push(
						`SMOKE ENV  ${loc}\n    This step starts the front standalone server with NODE_ENV=production but its \`env:\` block is missing a non-empty PUBLIC_ORIGIN. validateRuntimeEnv() refuses to start the server without it (otherwise the server would trust the client's Host header when building canonical and Open Graph URLs), so this step's smoke probe would never run against a real production server. Set PUBLIC_ORIGIN to the origin this step actually curls so resolveOrigin's configured origin and the request host agree.`,
					);
				}
			}
		}
	}

	return findings;
};

/**
 * #1693: Every workflow that uses actions/upload-artifact must have at least
 * one upload step that runs on the SUCCESS path (not only on failure()).
 */
export const checkUploadArtifactSuccessPath = async (
	rootDir: string,
): Promise<string[]> => {
	const findings: string[] = [];
	const { files, errorFinding } = await listWorkflowFiles(rootDir);

	if (errorFinding !== null) {
		findings.push(errorFinding);
		return findings;
	}

	for (const file of files) {
		const raw = await readFile(
			path.join(rootDir, workflowsDirectory, file),
			'utf8',
		);
		const document = parse(raw) as YamlDocument | null;
		const jobs = document?.jobs ?? {};

		let hasUploadArtifact = false;
		let hasSuccessPathUpload = false;
		const uncertainConditions: string[] = [];
		const failureGatedJobs: string[] = [];

		for (const jobId of Object.keys(jobs)) {
			const job = jobs[jobId];
			const jobSteps: YamlStep[] = job?.steps ?? [];
			const jobIf = job.if ?? '';
			const jobCondition = classifyIfCondition(jobIf);
			const jobGatesEveryUpload = jobCondition === 'failure-only';

			let jobHasUpload = false;
			for (const step of jobSteps) {
				const uses = (step.uses ?? '') as string;
				if (!isUploadArtifactStep(uses)) {
					continue;
				}

				hasUploadArtifact = true;
				jobHasUpload = true;

				const stepClassification = classifyIfCondition(
					(step.if ?? '') as string,
				);
				const classification = jobGatesEveryUpload
					? 'failure-only'
					: stepClassification;

				if (classification === 'success-path') {
					hasSuccessPathUpload = true;
				} else if (classification === 'uncertain') {
					uncertainConditions.push(
						`${step.name ?? '(unnamed)'}\n        if: ${step.if ?? ''}`,
					);
				}
			}

			if (jobHasUpload && jobGatesEveryUpload) {
				failureGatedJobs.push(
					`${file}::${jobId} (job \`if:\` is failure-only: \`${jobIf}\`)`,
				);
			}
		}

		if (hasUploadArtifact && !hasSuccessPathUpload) {
			const jobGateBlock =
				failureGatedJobs.length > 0
					? `\n    Failure-gated jobs: ${failureGatedJobs.join(
							', ',
						)} — every upload step under a failure-only job runs only on red, so it cannot satisfy the success-path requirement.`
					: '';
			const uncertainBlock =
				uncertainConditions.length > 0
					? `\n    Unrecognized \`if:\` conditions on upload steps (cannot tell whether they are success-path or failure-only — the guard must not silently decide):\n${uncertainConditions
							.map((c) => `      - ${c}`)
							.join(
								'\n',
							)}\n    Either rewrite the condition to mention \`success()\` or \`always()\` (success-path), or \`failure()\` (failure-only), or remove the condition entirely; otherwise the guard has no way to assert that the upload/download round-trip is exercised on a green run.`
					: '';
			findings.push(
				`UPLOAD ARTIFACT  ${file}\n    This workflow uses actions/upload-artifact but no upload step is classified as success-path. Add at least one upload step whose \`if:\` is unconditional or mentions \`success()\` / \`always()\` (and whose JOB is not failure-gated) so the upload/download round-trip is exercised on a green, non-fork run.${jobGateBlock}${uncertainBlock}`,
			);
		}
	}

	return findings;
};

const isDirectRun =
	process.argv[1] &&
	toPosixPath(process.argv[1]).endsWith(
		'packages/scripts-ts/src/check-ci-drift.ts',
	);

if (isDirectRun) {
	const findings = await findCiDrift({ rootDir: process.cwd() });

	if (findings.length > 0) {
		console.error(
			'CI drift detected — the local gate no longer matches .github/workflows:\n',
		);

		for (const finding of findings) {
			console.error(`  ${finding}\n`);
		}

		console.error(
			`Reconcile ${manifestPath}. See docs/guides/local-ci-gate.md for what each finding means.`,
		);
		process.exit(1);
	}

	console.log(
		'CI drift guard: every workflow step is reconciled with the local gate.',
	);
}
