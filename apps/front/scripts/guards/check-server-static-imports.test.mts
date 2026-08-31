/**
 * Tests for the server-static-imports guard (#1822 / #1872 paired red proof).
 *
 * The one these exist for: `apps/front/server.mjs` was rewritten twice
 * across the srvx 0.12 bump (commits `50f4a7dea` and `326548b79` in
 * `lane/deps-migrations`) and the pre-rewrite line
 *     import { serveStatic } from 'srvx/static';
 * stops resolving under srvx 0.12.7 — `serveStatic` is no longer
 * exported, the call site throws at startup, and the publish-now
 * link never appears because the front never serves a byte. A guard
 * that did not catch the import shape would let a future dep bump
 * (say, a `srvx@0.13` that renames `staticMiddleware`) put the same
 * regression back behind the next e2e retrigger — exactly the same
 * shape as the original #1628 / #1655 finding.
 *
 * These tests exercise both halves of the contract on real on-disk
 * fixtures, not on a regex over source:
 *
 *   - `findServerStaticImports(serverPath)` reads `server.mjs` via
 *     ts-morph's AST. A regression that drops the `srvx/static`
 *     filter, misses `import { X as Y }` aliases, or follows a
 *     namespace import (`import * as S from 'srvx/static'`) wrongly
 *     turns at least one of these tests red.
 *
 *   - `checkServerStaticImports(serverPath, loader)` resolves the
 *     real `srvx/static` exports through the injected loader. A
 *     regression that skipped the `Object.hasOwn` check, accepted a
 *     `null` loader, or called `Object.keys` against the wrong object
 *     turns at least one of these tests red.
 *
 * The paired red proof itself (a fixture `server.mjs` that imports
 * `serveStatic`, asserted against the real installed srvx) lives
 * under `apps/front/tests/proofs/1822/`, in a vitest harness with
 * inverted semantics — that is the contract the `Verify paired red
 * proofs` CI step exercises. The unit tests here exercise the same
 * guard the way it would be unit-tested in any other guard.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test as nodeTest } from 'node:test';

import {
	checkServerStaticImports,
	findServerStaticImports,
} from './check-server-static-imports.mts';

const root = mkdtempSync(path.join(tmpdir(), 'srvx-static-imports-'));
const write = (name: string, contents: string): string => {
	const full = path.join(root, name);
	writeFileSync(full, contents, 'utf8');
	return full;
};

let serverPath: string;

before(() => {
	serverPath = write(
		'server.mjs',
		[
			"import { serve } from 'srvx';",
			"import { serveStatic } from 'srvx/static';",
			'',
			'const fn = serveStatic({ dir: "/tmp" });',
			'',
		].join('\n'),
	);
});

after(() => {
	rmSync(root, { recursive: true, force: true });
});

void nodeTest(
	'finds the named import from srvx/static and reports its line',
	() => {
		const imports = findServerStaticImports(serverPath);
		assert.deepEqual(imports, [
			{ name: 'serveStatic', importAs: 'serveStatic', line: 2 },
		]);
	},
);

void nodeTest('skips named imports from other specifiers', () => {
	const otherPath = write(
		'other.mjs',
		[
			"import { somethingElse } from 'node:fs';",
			"import { serveStatic } from 'srvx';", // srvx (root), NOT srvx/static
			'',
		].join('\n'),
	);
	assert.deepEqual(findServerStaticImports(otherPath), []);
});

void nodeTest('reads the local name from `import { X as Y }` aliases', () => {
	const aliasedPath = write(
		'aliased.mjs',
		[
			"import { staticMiddleware as createStaticMiddleware } from 'srvx/static';",
			'',
		].join('\n'),
	);
	const imports = findServerStaticImports(aliasedPath);
	assert.equal(imports.length, 1);
	const first = imports[0];
	assert.ok(first !== undefined);
	assert.equal(first.name, 'staticMiddleware');
	assert.equal(first.importAs, 'createStaticMiddleware');
});

void nodeTest('returns multiple named imports in source order', () => {
	const multiPath = write(
		'multi.mjs',
		[
			"import { a, b as c } from 'srvx/static';",
			"import { d } from 'srvx/static';",
			'',
		].join('\n'),
	);
	const imports = findServerStaticImports(multiPath);
	assert.deepEqual(
		imports.map((entry) => entry.name),
		['a', 'b', 'd'],
	);
	assert.deepEqual(
		imports.map((entry) => entry.importAs),
		['a', 'c', 'd'],
	);
});

void nodeTest(
	'checkServerStaticImports: missing export surfaces the right name',
	async () => {
		// The shape of the #1822 / #1872 bug: server.mjs imports `serveStatic`,
		// the installed srvx does NOT export it, so the call site would be
		// `undefined({dir:...})` at runtime. The guard catches it here, where
		// it is loud and cheap, instead of inside a 30-second e2e timeout.
		const fixturePath = write(
			'broken.mjs',
			"import { serveStatic } from 'srvx/static';\n",
		);
		const missing = await checkServerStaticImports(fixturePath, async () => ({
			staticMiddleware: () => undefined,
		}));
		assert.equal(missing.length, 1);
		const first = missing[0];
		assert.ok(first !== undefined);
		assert.equal(first.name, 'serveStatic');
		assert.equal(first.importAs, 'serveStatic');
		assert.deepEqual([...first.availableExports], ['staticMiddleware']);
	},
);

void nodeTest(
	'checkServerStaticImports: every import resolves -> empty finding list',
	async () => {
		const fixturePath = write(
			'ok.mjs',
			"import { staticMiddleware as createStaticMiddleware } from 'srvx/static';\n",
		);
		const missing = await checkServerStaticImports(fixturePath, async () => ({
			staticMiddleware: () => undefined,
		}));
		assert.deepEqual(missing, []);
	},
);

void nodeTest(
	'checkServerStaticImports: zero imports fails closed',
	async () => {
		// A `server.mjs` that no longer imports anything from `srvx/static`
		// is one the guard can no longer protect. The contract requires a
		// loud failure, not a silent OK — the test pins that.
		const fixturePath = write('empty.mjs', "import { serve } from 'srvx';\n");
		await assert.rejects(
			checkServerStaticImports(fixturePath, async () => ({
				staticMiddleware: () => undefined,
			})),
			/imports ZERO named exports/,
		);
	},
);

void nodeTest(
	'checkServerStaticImports: missing server.mjs fails closed',
	async () => {
		// The guard cannot report compliance for a file it never read.
		await assert.rejects(
			checkServerStaticImports(path.join(root, 'absent.mjs'), async () => ({
				staticMiddleware: () => undefined,
			})),
			/does not exist/,
		);
	},
);

void nodeTest(
	'checkServerStaticImports: walks the real installed srvx/static on this host',
	async () => {
		// The paired-red-proof shape in vitest is a fixture file; the unit-test
		// shape here is the real installed module. srvx 0.12.7 exports
		// `staticMiddleware` (and ONLY that — verified live earlier today).
		// A regression that re-adds `serveStatic` would turn this red by
		// the absence rule, not by some hand-maintained list.
		const realPath = write(
			'real.mjs',
			"import { staticMiddleware as createStaticMiddleware } from 'srvx/static';\n",
		);
		const realSrvxStatic = await import('srvx/static');
		const availableExports = Object.keys(realSrvxStatic);
		const missing = await checkServerStaticImports(
			realPath,
			async () => realSrvxStatic,
		);
		assert.deepEqual(missing, []);
		// The availability claim is what the proof's mutation turns upside
		// down. Assert it here so a future srvx release that removes
		// `staticMiddleware` makes this test fail before any paired proof
		// even runs — a stale unit test that lies about the module shape is
		// the kind of guard rot #1822 documents.
		assert.ok(
			availableExports.includes('staticMiddleware'),
			`expected srvx/static to export staticMiddleware, got [${availableExports.join(', ')}]`,
		);
		assert.ok(
			!availableExports.includes('serveStatic'),
			`srvx/static appears to re-export \`serveStatic\` — ` +
				`either srvx was downgraded or a future release re-added the 0.11.x export. ` +
				`Update the paired red proof to reflect the new contract.`,
		);
	},
);
