/**
 * KEPT RED PROOF — issue #1484.
 *
 * This proof is deliberately excluded from the normal front suite. It reads
 * the real translation discovery scanner and asserts that the old bug is
 * present: a listed source file is read without an ENOENT-only recovery path.
 * On the corrected scanner the assertion fails, which is the kept-red state.
 *
 * The executable regression lives in
 * `src/lib/i18n/trans-render.guard.test.tsx`: it creates a real fixture,
 * deletes it after enumeration and before the scanner reads it, and expects
 * the scanner to continue. This proof is complementary evidence, not a
 * substitute for that behavioral test or its production fix.
 *
 * Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1484/red-1484-filesystem-race-guard.test.ts
 *
 * Mutation to reproduce the bug:
 *   Remove the `try`/`catch` around `readSourceFile(absolutePath)` in
 *   `discoverTransCallSites` while leaving other code unchanged. The
 *   `bugPresent` assertion then passes and the paired-proof runner reports
 *   the declared proof as stale.
 *
 * Honest limit: this static proof checks the source-level ENOENT recovery
 * contract. The deterministic runtime behavior is covered by the focused
 * scanner test named above.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SCANNER_SOURCE = path.resolve(
	process.cwd(),
	'src/lib/i18n/trans-render.guard.test.tsx',
);
const SCANNER_START = 'const discoverTransCallSites = (';
const SCANNER_END = 'const describeSite = (';

const readScannerBody = (): string => {
	let source: string;
	try {
		source = readFileSync(SCANNER_SOURCE, 'utf8');
	} catch (error) {
		throw new Error(
			`MESURE IMPOSSIBLE — could not read the real scanner at ${SCANNER_SOURCE}: ${String(error)}`,
		);
	}

	const start = source.indexOf(SCANNER_START);
	const end = source.indexOf(SCANNER_END, start + SCANNER_START.length);
	if (start < 0 || end < 0 || end <= start) {
		throw new Error(
			`MESURE IMPOSSIBLE — scanner anchors are missing in ${SCANNER_SOURCE}; the proof cannot identify the real discovery function.`,
		);
	}
	return source.slice(start, end);
};

const hasEnoentReadRecovery = (scannerBody: string): boolean =>
	/try\s*\{\s*source\s*=\s*readSourceFile\(absolutePath\);\s*\}\s*catch \(error\) \{\s*if \(isEnoent\(error\)\) \{\s*continue;\s*\}\s*throw error;\s*\}/.test(
		scannerBody,
	);

describe('filesystem race guard — translation source ENOENT recovery (#1484)', () => {
	it('keeps red while the real scanner still lacks narrow ENOENT recovery', () => {
		const bugPresent = !hasEnoentReadRecovery(readScannerBody());

		// On corrected code bugPresent is false, so this assertion fails and the
		// paired-proof runner records the expected kept-red assertion failure.
		expect(bugPresent).toBe(true);
	});
});
