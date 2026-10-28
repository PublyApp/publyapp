import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Shared core of the local-CI-gate REASON GUARD, imported by both of its
// sides:
//   - check-ci-drift.ts   the ENFORCEMENT: fails the gate on a violation.
//   - gen-reason-ref.ts   the GENERATOR: rewrites reason-guard-ref.json.
//
// They must agree on the same two things, or the ratchet is worthless: the
// reviewable-reason bar, and where the ratchet floor comes from. One
// implementation here is what makes that agreement structural instead of a
// comment that two files can drift away from.

// Matches the reviewable-reason bar this repo already enforces on lint
// suppressions (see the sibling guard in scripts/). "n/a" is not a reason.
export const minimumReasonLength = 24;

export const manifestPath = 'packages/scripts-ts/src/ci-gate-manifest.json';
export const removalsPath = 'packages/scripts-ts/src/ci-gate-removals.json';
export const reasonRefPath = 'packages/scripts-ts/src/reason-guard-ref.json';

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
export const isFiller = (text: string): boolean => {
	if (text.length === 0) {
		return false;
	}
	return fillerResidueLength(text) <= 1;
};

/**
 * Content-addresses a reason string using the same scheme as the reference
 * file (SHA-256, first 16 hex chars). The reason text is used as-is — after
 * `JSON.parse`, escape sequences like `\u2014` are already decoded to their
 * UTF-8 characters, so no normalization step is needed.
 */
export const hashReason = (text: string) =>
	createHash('sha256').update(text).digest('hex').slice(0, 16);

export interface ConfessionStep {
	step_id: string;
	reason: string;
	removed_at?: string;
}

export interface RemovalsConfession {
	steps: ConfessionStep[];
}

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
export const readRemovalsConfession = async (
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
				`Confession file ${removalsPath}: entry "${stepId}" has a reason that is filler (repeated short blocks — a single repeated character, a cycle, a repeated pair, or a stack of them). A valid confession must be a reviewable justification naming what was lost and why — filler is not a reason.`,
			);
		}

		steps.push({ step_id: stepId, reason, removed_at: removedAt });
	}

	return { steps };
};

/**
 * The shape of `reason-guard-ref.json` as both sides read it.
 *
 * `pinned_step_ids` is optional on purpose: a pre-ratchet reference has no
 * field at all (floor inactive), while a hand-tampered one can decode to
 * `null` or a non-array — which the enforcement must report as a NAMED
 * finding, never a silent skip.
 */
export interface ReasonRef {
	// The reference is parsed from untrusted JSON, so `pinned_step_ids` can
	// legitimately decode to `null` (a hand-tampered file). The type models
	// the boundary: `undefined` = pre-ratchet file (field absent), `null` or
	// a non-array = malformed/tampered (a named finding, never a silent skip).
	pinned_step_ids?: string[] | null;
	steps: Record<string, { reason_hash: string; reason: string }>;
}

/**
 * Resolves the ratchet floor's source commit: the merge-base of
 * origin/develop and HEAD — not HEAD directly, and not the working tree.
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
 * a brand-new branch with no common ancestor — both sides REFUSE TO RUN. They
 * must never fall back to HEAD or the working tree. A guard that degrades to
 * "trust HEAD/the working tree" on error is a guard that turns green exactly
 * when the attack succeeds. `subject` names the refusing side in the message
 * ("CI drift guard" / "Generator") so the failure still says WHO refused.
 */
export const resolveMergeBase = async (
	rootDir: string,
	subject: string,
): Promise<string> => {
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
			`${subject} REFUSING TO RUN: could not resolve \`git merge-base origin/develop HEAD\` in ${rootDir}. ` +
				`The ratchet floor is read from the merge-base commit (the last reviewed state of origin/develop), and this command failed. ` +
				`Re-run from inside a git repository that has origin/develop available (fetch it first if needed: \`git fetch origin develop\`). ` +
				`Neither the guard nor the generator falls back to HEAD or the working tree — a floor that degrades to "trust the attacker's commit" is no floor at all. ` +
				`Original error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (mergeBase === '') {
		throw new Error(
			`${subject} REFUSING TO RUN: \`git merge-base origin/develop HEAD\` returned empty (no common ancestor). ` +
				`This happens when the branch has no shared history with origin/develop, or origin/develop does not exist locally. ` +
				`The ratchet floor must come from the merge-base — the last reviewed-and-merged state of the target branch — not from HEAD (which in a PR IS the attacker's commit) or the working tree (which an uncommitted edit can lower). ` +
				`Fetch origin/develop and re-run, or verify the branch is based on origin/develop.`,
		);
	}

	return mergeBase;
};

/**
 * Reads `reason-guard-ref.json` from the merge-base commit (never HEAD, never
 * the working tree — see `resolveMergeBase` for why), parsed as a `ReasonRef`.
 *
 * A file that cannot be read OR parsed at that commit is a loud failure: the
 * ratchet floor must come from the committed reference, so a broken one
 * refuses to run instead of certifying an empty floor.
 */
export const readReasonRefFromMergeBase = async (
	rootDir: string,
	subject: string,
): Promise<ReasonRef> => {
	const mergeBase = await resolveMergeBase(rootDir, subject);

	// Step 2: read the committed reference from that merge-base commit.
	try {
		const { stdout } = await execFileAsync(
			'git',
			['show', `${mergeBase}:${reasonRefPath}`],
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
