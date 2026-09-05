/**
 * Tests for the server-static-imports guard (#1822 / #1872 paired red proof).
 *
 * The one these exist for: `apps/front/server.mjs` was rewritten twice
 * across the srvx 0.12 bump (commits `50f4a7dea` and `326548b79` in
 * `lane/deps-migrations`) and the pre-rewrite line
 *     import { serveStatic } from 'srvx/static';
 * stops resolving under srvx 0.12.7 — `serveStatic` is no longer
 * exported, so Node rejects the named import while loading the module,
 * before any call site runs, and the publish-now link never appears
 * because the front never serves a byte. A guard that did not catch the
 * import shape would let a future dep bump
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
 * #2018 — declared vs installed. The same suite also pins the
 * declared/installed srvx version comparison: when `package.json` pins
 * `srvx@0.12.7` but `node_modules/srvx` reports `0.11.16`, the guard's
 * previous advice ("Update server.mjs to use a name that does exist")
 * was a foot-gun — following it reintroduces the original #1822 defect.
 * The contract for #2018 is that an installed version that disagrees
 * with the declared one is reported with a DIFFERENT message that names
 * `pnpm install` and never suggests editing `server.mjs`. Tests in this
 * file pin both halves: the message includes the install advice and is
 * silent on source edits, and source-edit messaging only appears
 * after the versions agree.
 *
 * The paired red proof itself (a fixture `server.mjs` that imports
 * `serveStatic`, asserted against the real installed srvx) lives
 * under `apps/front/tests/proofs/1822/`, in a vitest harness with
 * inverted semantics — that is the contract the `Verify paired red
 * proofs` CI step exercises. The unit tests here exercise the same
 * guard the way it would be unit-tested in any other guard.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test as nodeTest } from 'node:test';

import {
	assertSrvxVersionsAgree,
	checkServerStaticImports,
	defaultSrvxVersionSource,
	formatGuardError,
	formatMissing,
	findServerStaticImports,
} from './check-server-static-imports.mts';

/**
 * #2018 — version-source injection seam for tests.
 *
 * Production uses the default source, which reads the real
 * `package.json` and real `node_modules/srvx/package.json`. Tests pass
 * fixtures for the declared version (whatever `apps/front/package.json`
 * would carry for the srvx dependency) and installed version (whatever
 * `node_modules/srvx/package.json` would carry after `pnpm install`).
 *
 * `installed: null` mirrors a host where the installed metadata file is
 * absent — the guard must treat that as a stale install, not as a source
 * defect.
 */
type SrvxVersions = {
	declared: string;
	installed: string | null;
};
const versions = (
	declared: string,
	installed: string | null,
): SrvxVersions => ({
	declared,
	installed,
});
const INSTALLED_OK = {
	staticMiddleware: () => undefined,
};

void nodeTest(
	'#2018: CLI formatting adds the guard prefix exactly once',
	() => {
		assert.equal(
			formatGuardError(
				new Error('server-static-imports guard: already labelled'),
			),
			'server-static-imports guard: already labelled',
		);
		assert.equal(
			formatGuardError(new Error('loader failed')),
			'server-static-imports guard: loader failed',
		);
	},
);

void nodeTest(
	'#2018: missing-export advice describes the ESM import failure accurately',
	() => {
		const lines = formatMissing([
			{
				name: 'serveStatic',
				importAs: 'serveStatic',
				line: 4,
				availableExports: ['staticMiddleware'],
			},
		]);
		const detail = lines[1];
		assert.ok(detail !== undefined);
		assert.match(
			detail,
			/rejects this named import while loading server\.mjs/i,
		);
		assert.doesNotMatch(detail, /undefined|not a function/i);
	},
);
/**
 * Wrap a fixture record into the `VersionSource` shape the production
 * code expects. The fixtures are values, but the production seam is two
 * functions (`readDeclared` / `readInstalled`) so a future guard can
 * read different sources without changing the call site.
 */
const asVersionSource = (fixture: SrvxVersions) => ({
	readDeclared: (): string => fixture.declared,
	readInstalled: (): string | null => fixture.installed,
});

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
		const result = await checkServerStaticImports(
			fixturePath,
			async () => INSTALLED_OK,
			asVersionSource(versions('0.12.7', '0.12.7')),
		);
		const missing = result.missing;
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
		const result = await checkServerStaticImports(
			fixturePath,
			async () => INSTALLED_OK,
			asVersionSource(versions('0.12.7', '0.12.7')),
		);
		assert.deepEqual(result.missing, []);
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
			checkServerStaticImports(
				fixturePath,
				async () => INSTALLED_OK,
				asVersionSource(versions('0.12.7', '0.12.7')),
			),
			/imports ZERO named exports/,
		);
	},
);

void nodeTest(
	'checkServerStaticImports: missing server.mjs fails closed',
	async () => {
		// The guard cannot report compliance for a file it never read.
		await assert.rejects(
			checkServerStaticImports(
				path.join(root, 'absent.mjs'),
				async () => INSTALLED_OK,
				asVersionSource(versions('0.12.7', '0.12.7')),
			),
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
		const result = await checkServerStaticImports(
			realPath,
			async () => realSrvxStatic,
			// This branch exercises the production-only happy path: the
			// version injection seam is only present in tests. When the
			// third argument is undefined the guard falls back to reading
			// the real `package.json` + `node_modules/srvx/package.json`,
			// which is the only path CI exercises.
			undefined,
		);
		const missing = result.missing;
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

// #2018 — declared vs installed. The guard must FIRST prove the installed
// srvx is the one the repo declares, and only then diagnose the source.
// Tests below pin both halves of the contract:
//   - declared ≠ installed → the guard fails with a `pnpm install`
//     message that names the mismatch and does NOT suggest editing
//     server.mjs;
//   - declared = installed → the guard proceeds to the export check, and
//     a real source defect is the only thing that produces the source-edit
//     advice;
//   - installed missing (`null`) → same failure path as a stale install.

void nodeTest(
	'#2018: declared != installed -> pnpm install advice, never source-edit advice',
	async () => {
		// The exact shape of the #2018 reproduction: package.json declares
		// srvx@0.12.7 but node_modules still carries 0.11.16. Source is
		// correct; install is behind. The guard must NEVER suggest editing
		// server.mjs here — that advice is what reintroduces #1822.
		const fixturePath = write(
			'#2018-stale.mjs',
			"import { staticMiddleware as createStaticMiddleware } from 'srvx/static';\n",
		);
		// The loader deliberately returns the 0.11.16 export shape
		// (`serveStatic`) so that the same fixture would be a finding under
		// the source check; the version check has to short-circuit it.
		const loader = async (): Promise<Record<string, unknown>> => ({
			serveStatic: () => undefined,
		});
		let caught: Error | undefined;
		try {
			await checkServerStaticImports(
				fixturePath,
				loader,
				asVersionSource(versions('0.12.7', '0.11.16')),
			);
		} catch (error) {
			caught = error instanceof Error ? error : new Error(String(error));
		}
		assert.ok(caught, 'declared != installed must throw, not silently pass');
		const message = caught.message;
		assert.match(
			message,
			/0\.12\.7/,
			`message must name the declared version, got: ${message}`,
		);
		assert.match(
			message,
			/0\.11\.16/,
			`message must name the installed version, got: ${message}`,
		);
		assert.match(
			message,
			/pnpm install/i,
			`message must suggest pnpm install, got: ${message}`,
		);
		assert.doesNotMatch(
			message,
			/Update server\.mjs/,
			`#2018 message must NOT suggest editing server.mjs — that advice reintroduces #1822. got: ${message}`,
		);
		assert.doesNotMatch(
			message,
			/pin srvx/,
			`#2018 message must NOT suggest pinning srvx to a different version. got: ${message}`,
		);
		assert.doesNotMatch(
			message,
			/source already targets/i,
			`#2018 message must not claim source correctness before versions agree. got: ${message}`,
		);
		assert.match(
			message,
			/cannot diagnose the source while they disagree/i,
			`#2018 message must explain why source diagnosis is deferred. got: ${message}`,
		);
	},
);

void nodeTest(
	'#2018: default version source reads an on-disk declared/installed mismatch',
	async () => {
		const frontDir = path.join(root, '#2018-on-disk-front');
		const installedDir = path.join(frontDir, 'node_modules', 'srvx');
		mkdirSync(installedDir, { recursive: true });
		writeFileSync(
			path.join(frontDir, 'package.json'),
			JSON.stringify({ dependencies: { srvx: '0.12.7' } }),
			'utf8',
		);
		writeFileSync(
			path.join(installedDir, 'package.json'),
			JSON.stringify({ version: '0.11.16' }),
			'utf8',
		);

		const fixturePath = write(
			'#2018-on-disk-stale.mjs',
			"import { staticMiddleware } from 'srvx/static';\n",
		);
		await assert.rejects(
			checkServerStaticImports(
				fixturePath,
				async () => ({ staticMiddleware: () => undefined }),
				defaultSrvxVersionSource(frontDir),
			),
			/error.*0\.12\.7.*0\.11\.16|0\.11\.16.*0\.12\.7/i,
		);
	},
);

const writeDeclaredPackage = (frontDir: string): void => {
	mkdirSync(frontDir, { recursive: true });
	writeFileSync(
		path.join(frontDir, 'package.json'),
		JSON.stringify({ dependencies: { srvx: '0.12.7' } }),
		'utf8',
	);
};

void nodeTest('#2018: absent installed metadata names the absent file', () => {
	const frontDir = path.join(root, '#2018-absent-installed');
	writeDeclaredPackage(frontDir);

	assert.throws(
		() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
		/installed.*absent.*package\.json/i,
	);
});

void nodeTest(
	'#2018: unreadable installed metadata names the read failure',
	() => {
		const frontDir = path.join(root, '#2018-unreadable-installed');
		const installedPackagePath = path.join(
			frontDir,
			'node_modules',
			'srvx',
			'package.json',
		);
		writeDeclaredPackage(frontDir);
		mkdirSync(installedPackagePath, { recursive: true });

		assert.throws(
			() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
			/could not read.*installed.*package\.json/i,
		);
	},
);

void nodeTest('#2018: invalid installed metadata names invalid JSON', () => {
	const frontDir = path.join(root, '#2018-invalid-installed');
	const installedDir = path.join(frontDir, 'node_modules', 'srvx');
	writeDeclaredPackage(frontDir);
	mkdirSync(installedDir, { recursive: true });
	writeFileSync(path.join(installedDir, 'package.json'), '{', 'utf8');

	assert.throws(
		() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
		/installed.*package\.json.*contains invalid JSON/i,
	);
});

void nodeTest(
	'#2018: installed metadata without version names the missing field',
	() => {
		const frontDir = path.join(root, '#2018-missing-version');
		const installedDir = path.join(frontDir, 'node_modules', 'srvx');
		writeDeclaredPackage(frontDir);
		mkdirSync(installedDir, { recursive: true });
		writeFileSync(path.join(installedDir, 'package.json'), '{}', 'utf8');

		assert.throws(
			() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
			/missing.*version/i,
		);
	},
);

void nodeTest('#2018: absent declared metadata names the absent file', () => {
	const frontDir = path.join(root, '#2018-absent-declared');

	assert.throws(
		() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
		/declared.*absent.*package\.json/i,
	);
});

void nodeTest(
	'#2018: unreadable declared metadata names the read failure',
	() => {
		const frontDir = path.join(root, '#2018-unreadable-declared');
		mkdirSync(path.join(frontDir, 'package.json'), { recursive: true });

		assert.throws(
			() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
			/could not read.*declared.*package\.json/i,
		);
	},
);

void nodeTest('#2018: invalid declared metadata names invalid JSON', () => {
	const frontDir = path.join(root, '#2018-invalid-declared');
	mkdirSync(frontDir, { recursive: true });
	writeFileSync(path.join(frontDir, 'package.json'), '{', 'utf8');

	assert.throws(
		() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
		/declared.*package\.json.*contains invalid JSON/i,
	);
});

void nodeTest(
	'#2018: declared metadata without dependencies.srvx names the missing field',
	() => {
		const frontDir = path.join(root, '#2018-missing-declared-version');
		mkdirSync(frontDir, { recursive: true });
		writeFileSync(
			path.join(frontDir, 'package.json'),
			JSON.stringify({ dependencies: {} }),
			'utf8',
		);

		assert.throws(
			() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
			/missing.*dependencies\.srvx.*version/i,
		);
	},
);

void nodeTest(
	'#2018: declared == installed -> proceeds to the export check (no version pre-emption)',
	async () => {
		// The companion half: when versions agree, the version check must
		// NOT short-circuit. A real source defect (an import of `serveStatic`
		// against an installed `staticMiddleware`) is still a finding, and
		// it produces the source-edit advice the previous message carried.
		const fixturePath = write(
			'#2018-source-defect.mjs',
			"import { serveStatic } from 'srvx/static';\n",
		);
		const result = await checkServerStaticImports(
			fixturePath,
			async () => INSTALLED_OK,
			asVersionSource(versions('0.12.7', '0.12.7')),
		);
		const missing = result.missing;
		assert.equal(missing.length, 1);
		assert.equal(missing[0]?.name, 'serveStatic');
	},
);

void nodeTest(
	'#2018: check returns the first resolved versions with its findings',
	async () => {
		const fixturePath = write(
			'#2018-resolved-versions.mjs',
			"import { staticMiddleware } from 'srvx/static';\n",
		);
		let declaredReads = 0;
		let installedReads = 0;
		const source = {
			readDeclared: (): string => {
				declaredReads += 1;
				return '0.12.7';
			},
			readInstalled: (): string => {
				installedReads += 1;
				return '0.12.7';
			},
		};

		const result = await checkServerStaticImports(
			fixturePath,
			async () => INSTALLED_OK,
			source,
		);

		assert.deepEqual(result.missing, []);
		assert.deepEqual(result.versions, {
			declared: '0.12.7',
			installed: '0.12.7',
		});
		assert.equal(declaredReads, 1);
		assert.equal(installedReads, 1);
	},
);

void nodeTest(
	'#2018: installed = null (no node_modules/srvx) -> same pnpm-install advice',
	async () => {
		// The installed copy can be entirely absent (a fresh clone that
		// never ran `pnpm install`). The guard must not pretend the source
		// is at fault, and must not pretend an empty installed version is
		// somehow in agreement with the declared one.
		const fixturePath = write(
			'#2018-no-node_modules.mjs',
			"import { staticMiddleware as createStaticMiddleware } from 'srvx/static';\n",
		);
		await assert.rejects(
			checkServerStaticImports(
				fixturePath,
				async () => INSTALLED_OK,
				asVersionSource(versions('0.12.7', null)),
			),
			/pnpm install/,
		);
	},
);

void nodeTest(
	'#2018: non-object declared metadata names invalid JSON object data',
	() => {
		const frontDir = path.join(root, '#2018-non-object-declared');
		mkdirSync(frontDir, { recursive: true });
		writeFileSync(path.join(frontDir, 'package.json'), 'null', 'utf8');

		assert.throws(
			() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
			/declared.*package\.json.*contains invalid JSON object data/i,
		);
	},
);

void nodeTest(
	'#2018: non-object installed metadata names invalid JSON object data',
	() => {
		const frontDir = path.join(root, '#2018-non-object-installed');
		const installedDir = path.join(frontDir, 'node_modules', 'srvx');
		writeDeclaredPackage(frontDir);
		mkdirSync(installedDir, { recursive: true });
		writeFileSync(path.join(installedDir, 'package.json'), '[]', 'utf8');

		assert.throws(
			() => assertSrvxVersionsAgree(defaultSrvxVersionSource(frontDir)),
			/installed.*package\.json.*contains invalid JSON object data/i,
		);
	},
);

void nodeTest(
	'#2018: back-compat — omitting the version argument keeps the legacy signature working',
	async () => {
		// The default source must read real files and surface a source finding
		// on a synchronized host; a stale install is itself a failure.
		const fixturePath = write(
			'#2018-legacy.mjs',
			"import { serveStatic } from 'srvx/static';\n",
		);
		// The default version source reads the real files. Real srvx 0.12.7
		// has no `serveStatic`; the loader pretends the installed copy is
		// shape-X so the source check is the part that fails.
		const result = await checkServerStaticImports(
			fixturePath,
			async () => ({}),
		);
		const missing = result.missing;
		const hasFinding = missing.length > 0;
		assert.ok(
			hasFinding,
			`legacy call without versions must still surface a finding when source is broken, got: ${JSON.stringify(missing)}`,
		);
		assert.equal(missing[0]?.name, 'serveStatic');
	},
);
