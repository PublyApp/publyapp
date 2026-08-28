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
		[oxlintBin, '--config', oxlintConfigPath, '--format', 'unix'],
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

const countWarnings = (output: string, ruleName: string): number => {
	// oxlint prints `[Warning/typescript(no-floating-promises)]`. The ruleName
	// already includes its parentheses (e.g. `typescript(no-floating-promises)`),
	// so we only append the closing bracket.
	const marker = `Warning/${ruleName}]`;
	const lines = output.split(/\r?\n/);
	let count = 0;

	for (const line of lines) {
		if (line.includes(marker)) {
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
		const { stdout, stderr } = runOxlint();
		const combined = `${stdout}\n${stderr}`;
		const actualCount = countWarnings(combined, baseline.rule);

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
