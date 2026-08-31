#!/usr/bin/env node
/**
 * Static-import contract guard for `apps/front/server.mjs` and the installed
 * `srvx` runtime (#1822 / #1872 paired red proof).
 *
 * WHAT THIS GUARD INSPECTS (AST + real module load, never just text).
 *
 * Two inputs:
 *   1. The named exports of the actually-installed `srvx/static` module —
 *      read at guard time by `import('srvx/static')`, never from a list
 *      copied into this file. A guard that carried its own copy of the
 *      export names would be the very defect it is meant to catch: the
 *      list would drift from the module and the guard would go quiet.
 *   2. The named imports of `apps/front/server.mjs` from `srvx/static`,
 *      read by parsing the file with ts-morph into a TypeScript AST — same
 *      reason `check-e2e-shared-constants.mts` gives: under TS 7 a bare
 *      `import ts from 'typescript'` no longer exposes the AST, and a
 *      regex over source text reads the name out of comments and strings.
 *
 * THE RULE. Every named import `server.mjs` takes from `srvx/static` must
 * exist as an export of the installed `srvx/static` module. A missing
 * export means the call site is `undefined(...)`, which throws
 * `TypeError: NAME is not a function` at server startup, and a server
 * that never started is a server whose pages never render — exactly the
 * shape of the publish-now e2e regression that #1628 and #1655 each
 * surfaced with the same `element(s) not found` message.
 *
 * SCOPE. Today only `srvx/static` is in scope. The contract generalises
 * to any other `srvx/*` subpath the server ends up importing, and to any
 * third-party surface whose API surface the server depends on; a
 * regression that adds a new subpath import is the obvious place to
 * widen this guard. Keeping the scope narrow today keeps the failure
 * message sharp: a future reader who sees a failed import from a module
 * the guard does not check yet knows exactly what to extend.
 *
 * FAIL-CLOSED. A run that finds zero imports from `srvx/static` is a
 * finding, not a skip. A `server.mjs` that imports nothing from
 * `srvx/static` is one that has been refactored past this guard's scope
 * and the guard is then protecting nothing — it must say so, not stay
 * silent. What enforces that rule is the unit suite next to this file:
 * the nine tests in `check-server-static-imports.test.mts` cover the
 * zero-import throw, the missing-file throw and the parser's alias
 * handling. The paired red proof under `apps/front/tests/proofs/1822/`
 * does NOT read this file — it reads `server.mjs` source directly, an
 * independent parsing path, and stays red whether or not this guard
 * exists. That independence is the point (it survives a silent
 * weakening of the guard) but it also means the proof cannot vouch for
 * the fail-closed rule; only the unit tests can. An earlier version of
 * this paragraph claimed the proof read the parser. It does not, and a
 * comment that misnames what protects what sends the next reader to the
 * wrong file.
 *
 * THE PAIRED RED PROOF (#1822). The bug that #1628 surfaced and #1872
 * labelled — `tenant-posts-publish-now` link never appears because the
 * front server crashed at startup — was caused by `srvx@0.12.7`
 * replacing the `serveStatic` named export with `staticMiddleware` while
 * the pre-#1628 `server.mjs` still wrote
 *     import { serveStatic } from 'srvx/static';
 * `serveStatic` is `undefined` in 0.12.7, the `serveStatic({dir:…})` call
 * throws, the server never starts, Traefik returns nothing, the e2e
 * times out on `expect(locator).toBeVisible()`. #1628 closed it by
 * migrating the import to `staticMiddleware as createStaticMiddleware`
 * — but the regression is still inside the dep graph: a future bump
 * (e.g. to `srvx@0.13`) that renames `staticMiddleware` again will
 * silence the e2e the same way unless this guard catches the import
 * shape first. This guard is the regression tripwire.
 *
 * KNOWN LIMITS, stated rather than left to be discovered.
 *
 *   1. The guard inspects `server.mjs` only. A second top-level module
 *      that imports from `srvx/static` would slip past. Today there is
 *      no such module; if one is added, the walker below must be
 *      widened in the same commit, or the guard must be replaced by one
 *      that walks a directory.
 *   2. The guard checks that an imported NAME exists, not that its call
 *      contract is unchanged. An `srvx` release that keeps
 *      `staticMiddleware` but changes what it accepts or returns
 *      defeats this guard entirely: a different startup crash, the same
 *      e2e symptom (#1872). What bounds that case is the
 *      `smoke:start` step and the e2e suite, which boot the real
 *      server — not this file. Widening the guard to the call contract
 *      would mean asserting on arity or a probe call, which is a
 *      different and heavier design; it is deliberately not attempted
 *      here, and the reader should not mistake a green run of this
 *      guard for a working server.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Project } from 'ts-morph';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(FRONT_DIR, '..', '..');
const SERVER_MJS = path.join(FRONT_DIR, 'server.mjs');
const SRVX_STATIC = 'srvx/static';

type ServerImport = {
	name: string;
	line: number;
	importAs: string;
};

/** Every named import `server.mjs` takes from `srvx/static`, mapped to the
 * line it appears on and the local name it is bound to. `importAs` is the
 * name used in the call site: for `import { staticMiddleware as foo }`, it
 * is `foo`, and that is the name the call site uses — which is what the
 * runtime actually tries to invoke. The remote name (`staticMiddleware`)
 * is what must exist as a `srvx/static` export.
 *
 * Returned in source order so the guard's output reads in source order,
 * matching the developer-facing convention every other guard in this
 * tree follows.
 */
export const findServerStaticImports = (serverPath: string): ServerImport[] => {
	if (!existsSync(serverPath)) {
		// Fail-closed on a missing server.mjs — the guard cannot say
		// "OK" against a file it never read. Throwing here lets the
		// CLI surface the real path; the unit test treats this as a
		// finding, not as an unhandled exception.
		throw new Error(
			`server-static-imports guard: the file to scan does not exist — ${serverPath}.`,
		);
	}

	const project = new Project({ useInMemoryFileSystem: false });
	const source = project.addSourceFileAtPath(serverPath);
	const out: ServerImport[] = [];
	for (const statement of source.getImportDeclarations()) {
		const specifier = statement.getModuleSpecifierValue();
		if (specifier !== SRVX_STATIC) {
			continue;
		}
		const namedBindings = statement.getNamedImports();
		for (const named of namedBindings) {
			const remoteName = named.getName();
			const importAs = named.getAliasNode()?.getText() ?? remoteName;
			out.push({
				name: remoteName,
				importAs,
				line: named.getStartLineNumber(),
			});
		}
	}
	return out;
};

type MissingImport = ServerImport & {
	availableExports: ReadonlyArray<string>;
};

const compareExports = (a: string, b: string): number => a.localeCompare(b);

const formatMissing = (missing: ReadonlyArray<MissingImport>): string[] => {
	const lines: string[] = [];
	for (const entry of missing) {
		const relativePath = path.relative(REPO_ROOT, SERVER_MJS);
		lines.push(
			`  ${relativePath}:${entry.line}  imports { ${entry.name} } ` +
				`from 'srvx/static' but srvx/static exports only ` +
				`[${[...entry.availableExports].sort(compareExports).join(', ')}].`,
		);
		lines.push(
			`    The call site uses the local name \`${entry.importAs}\`, which is ` +
				`\`undefined\` at runtime; Node will throw \`TypeError: ${entry.importAs} ` +
				`is not a function\` at server startup, and a server that never started ` +
				`is a server whose pages never render — exactly the publish-now e2e ` +
				`regression #1822 / #1872 caught. Update server.mjs to use a name that ` +
				`does exist, or pin srvx to a version where \`${entry.name}\` still ships.`,
		);
	}
	return lines;
};

/** Verify that every named import `server.mjs` takes from `srvx/static`
 * exists as a real export of the installed `srvx/static` module.
 *
 * `loader` is an injection seam for the test suite: production code
 * passes `() => import('srvx/static')`; tests pass a function that
 * returns a mock whose `Object.keys()` is the export list to assert
 * against. The default export object is read once and `Object.keys` is
 * the shape every CommonJS-compatible ESM module reports — including
 * the real `srvx/static` whose single export today is
 * `staticMiddleware` (verified live: `Object.keys(await import('srvx/static'))`
 * returns `['staticMiddleware']`). */
export const checkServerStaticImports = async (
	serverPath: string,
	loader: () => Promise<Record<string, unknown>>,
): Promise<MissingImport[]> => {
	const imports = findServerStaticImports(serverPath);
	if (imports.length === 0) {
		// Fail-closed on a server.mjs that imports nothing from srvx/static:
		// the guard is protecting nothing, so its compliance is not a finding.
		// The CLI surfaces this as a finding; the test asserts the rule.
		throw new Error(
			`server-static-imports guard: ${serverPath} imports ZERO named exports ` +
				`from 'srvx/static'. Either the guard's scope is wrong (extend it), ` +
				`or server.mjs has been refactored past the guard's reach. The guard ` +
				`cannot report compliance against a contract it no longer sees.`,
		);
	}

	const module_ = await loader();
	const availableExports = Object.keys(module_);
	const missing: MissingImport[] = [];
	for (const entry of imports) {
		if (!Object.hasOwn(module_, entry.name)) {
			missing.push({ ...entry, availableExports });
		}
	}
	return missing;
};

const main = async (): Promise<void> => {
	if (!existsSync(SERVER_MJS)) {
		console.error(
			`server-static-imports guard: the file to scan does not exist — ` +
				`${SERVER_MJS}. The guard cannot report compliance for a file it never read.`,
		);
		process.exit(1);
	}

	let missing: MissingImport[];
	try {
		missing = await checkServerStaticImports(
			SERVER_MJS,
			() => import('srvx/static'),
		);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`server-static-imports guard: ${message}`);
		process.exit(1);
	}

	if (missing.length > 0) {
		console.error(
			`server-static-imports guard: server.mjs imports ${missing.length} ` +
				`name(s) from 'srvx/static' that the installed srvx does not export — ` +
				`the server will throw at startup (#1822 / #1872):`,
		);
		for (const line of formatMissing(missing)) {
			console.error(line);
		}
		process.exit(1);
	}

	const imports = findServerStaticImports(SERVER_MJS);
	console.log(
		`server-static-imports guard: ${imports.length} named import(s) from ` +
			`'srvx/static' in server.mjs all resolve to live srvx exports [OK]`,
	);
};

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	void main();
}
