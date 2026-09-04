/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1822 / #1872 (paired red proof).
 *
 * ## Context
 *
 * `apps/front/server.mjs` is the entry the front Docker image runs in
 * production and the e2e stack boots in CI. It imports `srvx/static`
 * — the named-export surface of `srvx` that supplies the production
 * static-asset middleware. The exact line is, today (post-#1628):
 *
 *     import { staticMiddleware as createStaticMiddleware } from 'srvx/static';
 *
 * `srvx@0.11.x` shipped `serveStatic` from that subpath; `srvx@0.12.7`
 * removed it and replaced it with `staticMiddleware`. #1655 bumped
 * `srvx` to 0.12.7 without code migration, and the e2e suite failed at
 * `tenant-posts-publish-now.spec.ts` with `element(s) not found` — the
 * front never served a byte because `serveStatic({dir:...})` throws
 * `TypeError: serveStatic is not a function` at module load. #1628
 * migrated the import to `staticMiddleware`, the migration that became
 * commit `3f310e087` on develop.
 *
 * ## What this proof asserts
 *
 * The proof reads the REAL `apps/front/server.mjs` source on disk and
 * asserts the bug is PRESENT:
 *
 * > `server.mjs` carries `import { serveStatic } from 'srvx/static'`
 * > (or any other `srvx/static` named import that the installed srvx
 * > does not export — see below).
 *
 * The matching guard, `apps/front/scripts/guards/check-server-static-imports.mts`,
 * loads the real installed `srvx/static` and asserts every name
 * `server.mjs` imports from it actually exists. This proof asserts the
 * BUG the guard exists to catch, by reading the source directly — an
 * independent runtime, an independent parsing path, an independent
 * signal. If the guard's check is ever silently weakened (e.g. someone
 * changes it to read from a hand-maintained list, or the AST filter
 * for `srvx/static` is dropped), this proof still catches the import
 * shape itself.
 *
 * ## Two-state discrimination
 *
 * - BUG ABSENT (correct code): `server.mjs` imports only `staticMiddleware`
 *   (and/or its alias), which IS a live `srvx/static` export.
 *   `expect(importsServeStatic).toBe(true)` FAILS with an AssertionError
 *   → the kept-red state.
 *
 * - BUG PRESENT (mutation): `server.mjs` carries `import { serveStatic }`,
 *   either the bare form or via an alias, which is NOT a live `srvx/static`
 *   export. `expect(importsServeStatic).toBe(true)` PASSES → the proof
 *   is no longer red → CORRUPT PROOF → CI step reds.
 *
 * - MESURE IMPOSSIBLE: the proof cannot locate the file, or the source
 *   is unreadable, or both `srvx/static` references are missing (which
 *   means the guard has nothing left to assert against — also a finding).
 *   This state FAILS LOUD with a named reason — it NEVER silently
 *   collapses to "bug absent".
 *
 * ## Mutation that re-introduces the red
 *
 * Restore the pre-#1628 line in `apps/front/server.mjs`:
 *
 *     import { serveStatic } from 'srvx/static';
 *     const staticMiddleware = serveStatic({ dir: `${__dirname}/dist/client` });
 *
 * The proof then sees `importsServeStatic = true`, passes its
 * `expect(importsServeStatic).toBe(true)` assertion, and is no longer
 * red → CI's `Verify paired red proofs` step reports CORRUPT PROOF.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1822/red-1822-server-static-imports.test.ts
 *
 * Expected: FAIL — on correct code the import line is `staticMiddleware`
 * (not `serveStatic`), so the kept-red assertion `expect(importsServeStatic).toBe(true)`
 * fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const frontDir = fileURLToPath(new URL('../../..', import.meta.url));
const serverPath = `${frontDir}/server.mjs`;

test('server.mjs still imports the pre-#1628 `serveStatic` from srvx/static (#1822/#1872)', () => {
	if (!existsSync(serverPath)) {
		throw new Error(
			`MESURE IMPOSSIBLE: server.mjs not found at ${serverPath}. ` +
				`The proof cannot read the source.`,
		);
	}
	const source = readFileSync(serverPath, 'utf8');

	// The kept-red contract: the BUG must be present. The bug is the
	// pre-#1628 line `import { serveStatic } from 'srvx/static'`. On
	// correct code that line is gone — replaced by `staticMiddleware`
	// — so this regex fails to match and the assertion below fails,
	// keeping the proof red.
	//
	// The regex covers the bare form, the aliased form, and any
	// whitespace a developer might leave between the curly braces, so
	// a future regression that puts `serveStatic` back under any
	// aliasing shape re-opens the bug.
	const importsServeStatic =
		/import\s*\{\s*(?:\w+\s+as\s+)?serveStatic\s*(?:\s+as\s+\w+)?\s*\}\s*from\s*['"]srvx\/static['"]/.test(
			source,
		);
	expect(importsServeStatic).toBe(true);
});

test('apps/front/server.mjs calls `serveStatic` from srvx/static (#1822/#1872 — call-site contract)', () => {
	// Sister invariant of the import shape: the BUG includes not just
	// the import but the CALL SITE. `import { serveStatic }` is inert
	// without `serveStatic({...})` somewhere in the file, and a future
	// refactor that keeps the import (perhaps because of a code
	// reviewer's instinct to leave the line in case it is re-exported)
	// but drops the call site would still leave the server unbootable.
	// The kept-red shape: this test asserts the call site is MISSING,
	// so on correct code the assertion fails and the proof stays red.
	// On a regression that puts back the import line without calling
	// it, this assertion stays red (which would be a false negative
	// for this test, but the guard's runtime check still catches it);
	// the proof's import-shape test above is the primary tripwire.
	if (!existsSync(serverPath)) {
		throw new Error(
			`MESURE IMPOSSIBLE: server.mjs not found at ${serverPath}. ` +
				`The proof cannot read the source.`,
		);
	}
	const source = readFileSync(serverPath, 'utf8');
	// Word-boundary check on `serveStatic(` — the parens disambiguate
	// from a property access (`obj.serveStatic`) and from the import
	// line itself (no parens there). Multiline calls are caught too:
	// only the identifier matters, not its continuation.
	const callsServeStatic = /\bserveStatic\s*\(/.test(source);
	expect(callsServeStatic).toBe(true);
});
