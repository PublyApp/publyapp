/**
 * Fidelity guard for the first-deploy runbook witness file (#1831).
 *
 * The deployment-doc guard (check-deploy-env-docs.ts) pins the runbook's env-var
 * set against the LIVE runbook. The RED proof must be a faithful copy of the
 * runbook AS IT WAS at the base commit (490f6d03), so the guard sees the real
 * PUBLIC_ORIGIN gap and fires. A witness file that drifts from that commit
 * (by hand-edit, by merge, by a later `git checkout` of the path) makes the
 * RED proof false: the guard sees a runbook that never existed and draws the
 * wrong conclusion.
 *
 * The drift happened once already (eight lines differed at review time).
 * This test pins the witness to `git show 490f6d03:docs/deployment/first-deploy-runbook.md`
 * and fails naming the diff when they diverge. It is the standing guard against
 * a proof whose premise silently stops being true.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, test } from 'vitest';

const execFileAsync = promisify(execFile);

const COMMIT = '490f6d03';
const RELATIVE_PATH = 'docs/deployment/first-deploy-runbook.md';

const root = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

describe(`#1831 — witness file fidelity guard`, () => {
	test('witness file equals `git show ${COMMIT}:${RELATIVE_PATH}` exactly — no drift', async () => {
		const { stdout } = await execFileAsync(
			'git',
			['show', `${COMMIT}:${RELATIVE_PATH}`],
			{ cwd: root },
		);
		const committed = stdout;
		const witnessPath = path.join(
			root,
			'packages/scripts-ts/src/fixtures/first-deploy-runbook-at-490f6d03.md',
		);
		const witness = readFileSync(witnessPath, 'utf8');

		const diff = findFirstDiff(committed, witness);
		assert.equal(
			diff,
			null,
			`Witness file has drifted from ${COMMIT}:${RELATIVE_PATH}. ` +
				`The RED proof is now false — the guard reads a runbook that never existed. ` +
				`Restore the witness from the base commit ` +
				`(\`git show ${COMMIT}:${RELATIVE_PATH} > packages/scripts-ts/src/fixtures/first-deploy-runbook-at-${COMMIT}.md\`) ` +
				`and re-run the RED/GREEN pair to confirm the proof still fires.\n${diff ?? ''}`,
		);
	});
});

/**
 * Returns the first line where `actual` differs from `expected`, with context,
 * or null when they are byte-identical. Line-by-line comparison is preferable
 * to a raw equality assert because a single equality failure prints the whole
 * file; a diff pinpoints the exact divergence, which is what the operator
 * needs to repair the witness.
 */
function findFirstDiff(expected: string, actual: string): string | null {
	const expectedLines = expected.split('\n');
	const actualLines = actual.split('\n');
	const maxLines = Math.max(expectedLines.length, actualLines.length);

	for (let i = 0; i < maxLines; i++) {
		const expectedLine = expectedLines[i] ?? '<missing>';
		const actualLine = actualLines[i] ?? '<missing>';
		if (expectedLine !== actualLine) {
			return (
				`Line ${i + 1}:\n` +
				`  expected (commit ${COMMIT}): ${truncate(expectedLine)}\n` +
				`  actual   (witness file): ${truncate(actualLine)}`
			);
		}
	}
	return null;
}

function truncate(line: string, max = 200): string {
	return line.length > max ? `${line.slice(0, max)}…` : line;
}
