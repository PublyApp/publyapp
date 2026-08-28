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

// @ts-expect-error rung-0: add proper type in later rung
const toPosixPath = (value) => value.split(path.sep).join('/');

/**
 * Normalizes a reason string so the hash is encoding-invariant.
 * Unescapes `\uXXXX` sequences to their UTF-8 characters, so a manifest
 * that stores `\u2014` and one that stores `—` produce the same hash.
 * This is idempotent: after JSON.parse, the reason is already in UTF-8
 * form, so this is a no-op. It handles the case where a raw string
 * (e.g., from a test fixture) still contains escape sequences.
 */
// @ts-expect-error rung-0: add proper type in later rung
const normalizeReason = (text) =>
	String(text).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
		String.fromCharCode(parseInt(hex, 16)),
	);

/**
 * Content-addresses a reason string using the same scheme as the reference
 * file (SHA-256, first 16 hex chars).
 */
// @ts-expect-error rung-0: add proper type in later rung
const hashReason = (text) =>
	createHash('sha256')
		.update(normalizeReason(text))
		.digest('hex')
		.slice(0, 16);

/**
 * Checks whether a reason has changed (especially shrunk) while the step
 * hash is unchanged. The reference file (`reason-guard-ref.json`) holds the
 * known-good fingerprint; any deviation while the step itself hasn't changed
 * fails the guard. A deliberate rewrite is possible by updating the reference
 * in the same commit — same mechanism as the complexity ceilings.
 */
// @ts-expect-error rung-0: add proper type in later rung
const getReasonGuardProblem = (id, entry) => {
	const ref = reasonRef.steps[id];

	// No reference entry (e.g., a brand-new step not yet pinned). The
	// NEW STEP / CHANGED checks already cover step-level drift; the reason
	// guard only fires against a known-good baseline.
	if (ref === undefined) {
		return null;
	}

	const normalized = normalizeReason(entry.reason);
	const currentHash = hashReason(entry.reason);

	if (currentHash === ref.reason_hash) {
		return null;
	}

	const currentLength = normalized.length;
	const expectedLength = ref.reason_length;

	if (currentLength < expectedLength) {
		return `${manifestPath}: entry "${id}" reason SHRANK from ${expectedLength} to ${currentLength} characters while the step hash is unchanged (expected reason hash ${ref.reason_hash}, got ${currentHash}). Truncation is not a rewrite — restore the original reason, or update reason-guard-ref.json in the same commit if the rewrite is deliberate.`;
	}

	return `${manifestPath}: entry "${id}" reason CHANGED (expected hash ${ref.reason_hash}, got ${currentHash}; expected ${expectedLength} chars, got ${currentLength}) while the step hash is unchanged. If this is a deliberate rewrite, update reason-guard-ref.json in the same commit so the reference matches the new reason.`;
};
// @ts-expect-error rung-0: add proper type in later rung
const normalizeCommand = (value) =>
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
// @ts-expect-error rung-0: TS7023
const toStableJson = (value) => {
	if (Array.isArray(value)) {
		return `[${value.map(toStableJson).join(',')}]`;
	}

	if (value !== null && typeof value === 'object') {
		const keys = Object.keys(value).sort();
		// @ts-expect-error rung-0: TS7022
		const body = keys
			// @ts-expect-error rung-0: TS7024
			.map((key) => `${JSON.stringify(key)}:${toStableJson(value[key])}`)
			.join(',');

		return `{${body}}`;
	}

	return JSON.stringify(value ?? null);
};

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
// @ts-expect-error rung-0: add proper type in later rung
const hashStep = (step) => {
	const payload = {
		'continue-on-error': step['continue-on-error'] ?? null,
		env: step.env ?? null,
		if: step.if ?? null,
		run: 'run' in step ? normalizeCommand(step.run) : null,
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
// @ts-expect-error rung-0: add proper type in later rung
const getStepLabel = (step, index) => {
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
// @ts-expect-error rung-0: add proper type in later rung
const collectWorkflowSteps = async (rootDir) => {
	const directory = path.join(rootDir, workflowsDirectory);
	const entries = await readdir(directory, { withFileTypes: true });
	const steps = [];
	const problems = [];

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
		const document = parse(raw);
		const jobs = document?.jobs ?? {};

		for (const jobId of Object.keys(jobs).sort()) {
			const jobSteps = jobs[jobId]?.steps ?? [];
			const seenLabels = new Set();

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
// @ts-expect-error rung-0: add proper type in later rung
const getEntryValidationProblem = (id, entry) => {
	if (entry === null || typeof entry !== 'object') {
		return `${manifestPath}: entry "${id}" must be an object.`;
	}

	if (typeof entry.hash !== 'string' || entry.hash.length === 0) {
		return `${manifestPath}: entry "${id}" is missing a \`hash\`.`;
	}

	const hasMirror = typeof entry.mirror === 'string' && entry.mirror.length > 0;

	if (!hasMirror && entry.mirror !== null) {
		return `${manifestPath}: entry "${id}" must set \`mirror\` to the local command that covers it, or to null when it is exempt.`;
	}

	if (
		typeof entry.reason !== 'string' ||
		entry.reason.trim().length < minimumReasonLength
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
 * Compares the workflows against the manifest and returns human-readable
 * findings. Returns an empty array when the gate is fully reconciled.
 */
// @ts-expect-error rung-0: add proper type in later rung
export const findCiDrift = async ({ rootDir }) => {
	const { problems, steps } = await collectWorkflowSteps(rootDir);
	const findings = [...problems];

	const manifestRaw = await readFile(path.join(rootDir, manifestPath), 'utf8');
	const manifest = JSON.parse(manifestRaw);
	const entries = manifest.steps ?? {};

	const seen = new Set();

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

		if (entry.hash !== step.hash) {
			findings.push(
				`CHANGED   ${step.id}\n    This CI step changed since it was reconciled (manifest ${entry.hash}, workflow ${step.hash}).\n    Re-check that "${entry.mirror ?? '(exempt)'}" still covers it, then update the hash to "${step.hash}".`,
			);
		} else {
			// Reason guard: detect truncation/alteration of a reason while the
			// step hash is unchanged. A deliberate rewrite is possible by
			// updating reason-guard-ref.json in the same commit.
			const reasonProblem = getReasonGuardProblem(step.id, entry);

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
