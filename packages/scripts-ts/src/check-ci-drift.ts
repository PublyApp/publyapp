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
 * A reason is filler when it carries no information — a single repeated
 * character padded to clear the length bar (e.g. `"x".repeat(24)`). Such a
 * string is not a reviewable justification; it is a bypass of the quality
 * bar. We reject it regardless of length.
 */
const isFiller = (text: string): boolean => {
	if (text.length === 0) {
		return false;
	}
	const first = text[0];
	for (let i = 1; i < text.length; i++) {
		if (text[i] !== first) {
			return false;
		}
	}
	return true;
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
const getReasonGuardProblem = (
	id: string,
	entry: { hash: string; mirror: string | null; reason: string },
	ref: {
		steps: Record<string, { reason_hash: string; reason_length: number }>;
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

	const currentHash = hashReason(entry.reason);

	if (currentHash === stepRef.reason_hash) {
		return null;
	}

	const currentLength = entry.reason.length;
	const expectedLength = stepRef.reason_length;

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
				`Confession file ${removalsPath}: entry "${stepId}" has a reason that is filler (a single repeated character). A valid confession must be a reviewable justification naming what was lost and why — filler is not a reason.`,
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
	const pinned = ref.pinned_step_ids ?? [];

	if (pinned.length === 0) {
		return findings;
	}

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

	const confessedIds = new Set(confession?.steps.map((s) => s.step_id) ?? []);

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
	const directory = path.join(rootDir, workflowsDirectory);
	const entries = await readdir(directory, { withFileTypes: true });
	const steps: { hash: string; id: string; kind: 'run' | 'uses' }[] = [];
	const problems: string[] = [];

	const files = entries
		.filter(
			(entry) =>
				entry.isFile() &&
				(entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')),
		)
		.map((entry) => entry.name)
		.sort();

	for (const file of files) {
		const raw = await readFile(path.join(directory, file), 'utf8');
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
		return `${manifestPath}: entry "${id}" has a reason that is filler (a single repeated character). A reviewable reason must name what the mirror covers or why the step cannot run locally — filler is not a reason.`;
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
	pinned_step_ids?: string[];
	steps: Record<string, { reason_hash: string; reason_length: number }>;
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
