import { spawnSync } from 'node:child_process';
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

// @ts-expect-error rung-0: add proper type in later rung
const runOxlint = () => {
	const result = spawnSync(
		process.execPath,
		[oxlintBin, '--config', oxlintConfigPath, '--format', 'unix'],
		{ cwd: repoRoot, encoding: 'utf8' },
	);

	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
};

// @ts-expect-error rung-0: add proper type in later rung
const countWarnings = (output, ruleName) => {
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

export const checkNoFloatingPromises = async () => {
	const baselineContent = await readFile(baselinePath, 'utf8');
	// @ts-expect-error rung-0: add proper type in later rung
	const baseline = JSON.parse(baselineContent);
	const { stdout, stderr } = runOxlint();
	const combined = `${stdout}\n${stderr}`;
	const actualCount = countWarnings(combined, baseline.rule);

	return {
		rule: baseline.rule,
		baseline: baseline.count,
		actual: actualCount,
		withinLimit: actualCount <= baseline.count,
	};
};

const run = async () => {
	const result = await checkNoFloatingPromises();

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
