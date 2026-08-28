import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Ratchet guard for issue #1679.
//
// Counts `typescript(no-floating-promises)` warnings repo-wide and FAILS when
// the count rises above the pinned baseline in
// packages/scripts-ts/src/no-floating-promises-baseline.json. Eleven of these
// were introduced silently with PR #1649 because warnings don't fail `pnpm
// lint` (which passes `--quiet`). A green suite is not evidence here — it was
// already green with the eleven warnings in place.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const baselinePath = path.join(here, 'no-floating-promises-baseline.json');
const oxlintBin = path.join(repoRoot, 'node_modules/oxlint/bin/oxlint');
const oxlintConfigPath = path.join(repoRoot, '.oxlintrc.json');

// Fail CLOSED: if the oxlint binary is missing or cannot be executed,
// we cannot verify the warning count — so we must refuse to pass rather
// than silently report "0 warnings, within limit". A ratchet that fails
// open is no ratchet at all; it would let a missing dependency mask a
// real regression. See issue #1679.
const assertOxlintAvailable = () => {
	if (!existsSync(oxlintBin)) {
		throw new Error(
			`oxlint binary not found at ${oxlintBin} — ` +
				'cannot count no-floating-promises warnings. Ensure `pnpm install` ' +
				'has run and oxlint is in node_modules.',
		);
	}
};

const runOxlint = () => {
	assertOxlintAvailable();

	const result = spawnSync(
		process.execPath,
		[oxlintBin, '--config', oxlintConfigPath, '--format', 'json'],
		{ cwd: repoRoot, encoding: 'utf8' },
	);

	if (result.error) {
		throw new Error(
			`Failed to execute oxlint: ${result.error.message} — ` +
				'cannot count no-floating-promises warnings.',
		);
	}

	// status === null means the process was killed by a signal; nonzero means
	// oxlint exited with an error. Either way, the output is unreliable.
	if (result.status !== 0) {
		throw new Error(
			`oxlint exited with status ${result.status} — ` +
				'cannot count no-floating-promises warnings reliably.',
		);
	}

	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
};

// Counts warnings matching `ruleName` from oxlint's JSON output.
//
// Fail-closed by design: oxlint's JSON format is the only output we know how
// to interpret. Anything else — empty output, truncated JSON, garbled text,
// an unexpected structure — makes us THROW, and the caller converts that into
// an `withinLimit: 'error'` result. We never fall back to "0 warnings".
//
// Why JSON instead of the unix format we used to parse: the unix format is
// line-oriented text. An empty or garbled line-oriented output silently
// produces a count of 0, which passes green. JSON is structured: if the
// output is not valid JSON, or not the shape we expect, JSON.parse fails
// loud. That is exactly the fail-closed behaviour the ratchet needs — a
// garbled oxlint must never look like "0 warnings, within limit".
const countWarningsFromJson = (output: string, ruleName: string): number => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch (_error) {
		throw new Error(
			'oxlint output is not valid JSON — ' +
				'expected JSON from `--format json`, but parsing failed. ' +
				`Cannot count ${ruleName} warnings. Output (first 200 chars): ${output.slice(0, 200)}`,
		);
	}

	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(
			'oxlint JSON output is not an object — ' +
				`expected { diagnostics: [...], number_of_files: N }, got: ${output.slice(0, 200)}`,
		);
	}

	const parsedObj = parsed as Record<string, unknown>;

	if (!Array.isArray(parsedObj.diagnostics)) {
		throw new Error(
			'oxlint JSON output is missing the diagnostics array — ' +
				`expected { diagnostics: [...], number_of_files: N }, got: ${output.slice(0, 200)}`,
		);
	}

	// Fail-closed: the repo has thousands of TS/TSX files. If oxlint scanned 0,
	// something is wrong (config error, all files ignored, etc.). A count of 0
	// with 0 files scanned is not a real "within limit" result — it is a broken
	// scan that would silently pass.
	if (parsedObj.number_of_files === 0) {
		throw new Error(
			'oxlint scanned 0 files — ' +
				"expected to scan the repo's TS/TSX files. " +
				'Check the oxlint config and ignore patterns.',
		);
	}

	const diagnostics = parsedObj.diagnostics as Array<Record<string, unknown>>;
	let count = 0;

	for (const diagnostic of diagnostics) {
		if (diagnostic.code === ruleName && diagnostic.severity === 'warning') {
			count += 1;
		}
	}

	return count;
};

// The result type includes an 'error' sentinel so the caller can distinguish
// "count is within limit" from "could not count at all" without throwing.
type RatchetResult = {
	rule: string;
	baseline: number;
	actual: number;
	withinLimit: boolean | 'error';
};

export const checkNoFloatingPromises = async (): Promise<RatchetResult> => {
	try {
		const baselineContent = await readFile(baselinePath, 'utf8');
		const baseline = JSON.parse(baselineContent) as {
			rule: string;
			count: number;
		};

		// Fail closed: an invalid baseline must never silently pass. A missing
		// rule or a missing/non-numeric count means we cannot verify the
		// ratchet — throwing here converts to withinLimit="error".
		if (typeof baseline.rule !== 'string' || baseline.rule.length === 0) {
			throw new Error(
				'baseline JSON is missing a valid `rule` string — ' +
					'cannot count no-floating-promises warnings without a rule to match.',
			);
		}
		if (
			typeof baseline.count !== 'number' ||
			!Number.isFinite(baseline.count)
		) {
			throw new Error(
				`baseline JSON has a missing or non-numeric \`count\` (${String(baseline.count)}) — ` +
					'cannot compare the warning count against an invalid baseline.',
			);
		}

		const { stdout } = runOxlint();
		const actualCount = countWarningsFromJson(stdout, baseline.rule);

		return {
			rule: baseline.rule,
			baseline: baseline.count,
			actual: actualCount,
			withinLimit: actualCount <= baseline.count,
		};
	} catch (error) {
		console.error(
			`no-floating-promises ratchet failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return {
			rule: 'typescript(no-floating-promises)',
			baseline: 0,
			actual: 0,
			withinLimit: 'error',
		};
	}
};

const run = async () => {
	const result = await checkNoFloatingPromises();

	if (result.withinLimit === 'error') {
		// The error was already logged; just exit nonzero.
		process.exit(1);
	}

	if (result.withinLimit) {
		console.log(
			`${result.rule}: ${result.actual} (baseline ${result.baseline}) — within limit.`,
		);
		return;
	}

	console.error(
		`${result.rule}: ${result.actual} exceeds baseline ${result.baseline} — silent regression (issue #1679).`,
	);
	console.error(
		`If the new warnings are legitimate, fix them; if genuinely unavoidable, lower the baseline deliberately in ${baselinePath}.`,
	);
	process.exit(1);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await run();
}
