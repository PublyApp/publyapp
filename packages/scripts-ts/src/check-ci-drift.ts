import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parse } from 'yaml';

import { reasonRef } from './reason-guard-ref.ts';

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

// Matches the reviewable-reason bar this repo already enforces on lint
// suppressions (see the sibling guard in scripts/). "n/a" is not a reason.
const minimumReasonLength = 24;

const toPosixPath = (value: string) => value.split(path.sep).join('/');

/**
 * Content-addresses a reason string using the same scheme as the reference
 * file (SHA-256, first 16 hex chars). The reason text is used as-is — after
 * `JSON.parse`, escape sequences like `\u2014` are already decoded to their
 * UTF-8 characters, so no normalization step is needed.
 */
export const hashReason = (text: string) =>
	createHash('sha256').update(text).digest('hex').slice(0, 16);

// Checks whether a reason has changed (especially shrunk) while the step
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
// #1841 (round 2): the former defense-in-depth check (hashReason(stepRef.reason)
// !== stepRef.reason_hash) was removed because it catches exactly the SAME scenario
// as the main comparison — verified by mutation testing, no case exists where ONLY
// it would fire. A redundant check that duplicates detection without adding coverage
// is dead code; the main comparison is the single source of truth.
const getReasonGuardProblem = (
	id: string,
	entry: { hash: string; mirror: string | null; reason: string },
	ref: {
		steps: Record<
			string,
			{ reason_hash: string; reason_length: number; reason: string }
		>;
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
	// default. A malformed entry is a finding, not an exception.
	if (typeof stepRef.reason !== 'string' || stepRef.reason.length === 0) {
		return `${manifestPath}: entry "${id}" reason-guard-ref.json is missing the \`reason\` text field (got ${stepRef.reason === undefined ? 'undefined' : typeof stepRef.reason}). The reference must store the full reason text so regeneration is visible in the diff; regenerate it with \`node packages/scripts-ts/src/gen-reason-ref.ts\`.`;
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
	steps: Record<
		string,
		{ reason_hash: string; reason_length: number; reason: string }
	>;
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
 * @param {Object} options
 * @param {string} options.rootDir - Repository root directory.
 * @param {ReasonRef} [options.reasonRef] - Optional reason reference override
 *   (defaults to the pinned reason-guard-ref.json). Used by tests to inject
 *   a fixture reference without touching the real one.
 */
export const findCiDrift = async ({
	rootDir,
	reasonRef: reasonRefOption,
}: {
	rootDir: string;
	reasonRef?: ReasonRef;
}): Promise<string[]> => {
	const ref = reasonRefOption ?? reasonRef;
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
