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
 * export makes Node reject the named import while loading `server.mjs`,
 * so the process exits before server startup and its pages never render —
 * exactly the shape of the publish-now e2e regression that #1628 and
 * #1655 each surfaced with the same `element(s) not found` message.
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
 * the focused tests in `check-server-static-imports.test.mts` cover
 * the zero-import throw, the missing-file throw and the parser's alias
 * handling, plus the #2018 declared-vs-installed version comparison
 * that pins the `pnpm install` vs source-edit advice split. The paired
 * red proof under `apps/front/tests/proofs/1822/` does NOT read this
 * file — it reads `server.mjs` source directly, an independent
 * parsing path, and stays red whether or not this guard exists. That
 * independence is the point (it survives a silent weakening of the
 * guard) but it also means the proof cannot vouch for the fail-closed
 * rule; only the unit tests can. An earlier version of this paragraph
 * claimed the proof read the parser. It does not, and a comment that
 * misnames what protects what sends the next reader to the wrong file.
 *
 * THE PAIRED RED PROOF (#1822). The bug that #1628 surfaced and #1872
 * labelled — `tenant-posts-publish-now` link never appears because the
 * front server crashed at startup — was caused by `srvx@0.12.7`
 * replacing the `serveStatic` named export with `staticMiddleware` while
 * the pre-#1628 `server.mjs` still wrote
 *     import { serveStatic } from 'srvx/static';
 * `serveStatic` is not exported in 0.12.7, so Node rejects the named
 * import while loading `server.mjs`; the server never starts, Traefik
 * returns nothing, and the e2e times out on `expect(locator).toBeVisible()`.
 * #1628 closed it by
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
 *   3. #2018 — DECLARED vs INSTALLED. The guard reads the installed
 *      module as its source of truth, so it can only diagnose a real
 *      source defect if the installed module is the one the repo
 *      declares. `apps/front/package.json` pins `srvx@0.12.7`; a
 *      worktree whose `node_modules` still carries `0.11.16` would
 *      otherwise be told `Update server.mjs to use a name that does
 *      exist`, and following that advice is what reintroduces the
 *      original #1822 defect. The version check below fails fast with a
 *      `pnpm install` message and NEVER suggests editing `server.mjs`.
 *      Only an equal declared/installed pair may proceed to the
 *      export-shape check. CI installs with `--frozen-lockfile`, so this
 *      is a local-only trap — local-only traps are the ones that get
 *      committed. The same reasoning applies to any future guard that
 *      reads an installed module as its source of truth.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Project } from 'ts-morph';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(FRONT_DIR, '..', '..');
const SERVER_MJS = path.join(FRONT_DIR, 'server.mjs');
const SRVX_STATIC = 'srvx/static';
const SRVX_PACKAGE = 'srvx';
const GUARD_PREFIX = 'server-static-imports guard:';

export const formatGuardError = (error: unknown): string => {
	const message = error instanceof Error ? error.message : String(error);
	if (message.startsWith(`${GUARD_PREFIX} `)) {
		return message;
	}
	return `${GUARD_PREFIX} ${message}`;
};

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

type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const readJsonObject = (
	filePath: string,
	description: string,
): JsonObject | null => {
	let contents: string;
	try {
		contents = readFileSync(filePath, 'utf8');
	} catch (error: unknown) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return null;
		}
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`server-static-imports guard: could not read ${description} at ` +
				`${filePath}: ${detail}.`,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`server-static-imports guard: ${description} at ${filePath} ` +
				`contains invalid JSON: ${detail}.`,
		);
	}

	if (!isJsonObject(parsed)) {
		throw new Error(
			`server-static-imports guard: ${description} at ${filePath} ` +
				`contains invalid JSON object data.`,
		);
	}
	return parsed;
};

/**
 * #2018 — declared srvx version (what `apps/front/package.json` pins)
 * versus installed srvx version (what `node_modules/srvx/package.json`
 * reports after `pnpm install`). Both inputs are injection seams so the
 * unit suite can assert on a mismatch without touching real install
 * state. Production callers pass:
 *
 *   - `readDeclared`: returns the value of
 *     `apps/front/package.json`'s `dependencies.srvx`.
 *   - `readInstalled`: returns the `version` field of
 *     `node_modules/srvx/package.json`, or `null` when that package
 *     metadata file is absent (a fresh clone that never ran `pnpm install`).
 *
 * The check is exact-equality, not semver-aware. `apps/front` pins srvx
 * to an exact version (the `assert-pinned.mts` preinstall hook enforces
 * this across all deps), so a wider semver comparison would hide the
 * trap: a worktree with `node_modules/srvx@0.12.6` and a `package.json`
 * pin of `0.12.7` must fail loudly, not pass because semver sees the
 * pair as compatible.
 */
type VersionSource = {
	readDeclared: () => string;
	readInstalled: () => string | null;
};

const readDeclaredSrvxFromPkg = (pkgPath: string): string => {
	const raw = readJsonObject(pkgPath, 'declared dependency metadata');
	if (raw === null) {
		throw new Error(
			`server-static-imports guard: declared dependency metadata is absent at ` +
				`${pkgPath}.`,
		);
	}
	const dependencies = raw.dependencies;
	if (!isJsonObject(dependencies)) {
		throw new Error(
			`server-static-imports guard: ${pkgPath} is missing the ` +
				`dependencies.${SRVX_PACKAGE} version field.`,
		);
	}
	const declared = dependencies[SRVX_PACKAGE];
	if (typeof declared !== 'string' || declared.length === 0) {
		throw new Error(
			`server-static-imports guard: ${pkgPath} is missing the ` +
				`dependencies.${SRVX_PACKAGE} version field.`,
		);
	}
	return declared;
};

const readInstalledSrvxVersion = (nodeModulesPath: string): string | null => {
	const raw = readJsonObject(
		nodeModulesPath,
		'installed srvx package metadata',
	);
	if (raw === null) {
		return null;
	}
	if (typeof raw.version !== 'string' || raw.version.length === 0) {
		throw new Error(
			`server-static-imports guard: ${nodeModulesPath} is missing the ` +
				`installed srvx version field.`,
		);
	}
	return raw.version;
};

/**
 * Default production seam: reads the real on-disk files at FRONT_DIR.
 * Tests may supply a front directory containing the same package.json and
 * node_modules/srvx/package.json layout so the default file-reading path is
 * exercised without changing the real install.
 */
export const defaultSrvxVersionSource = (
	frontDir = FRONT_DIR,
): VersionSource => {
	const pkgPath = path.join(frontDir, 'package.json');
	const installedPath = path.join(
		frontDir,
		'node_modules',
		SRVX_PACKAGE,
		'package.json',
	);
	return {
		readDeclared: () => readDeclaredSrvxFromPkg(pkgPath),
		readInstalled: () => readInstalledSrvxVersion(installedPath),
	};
};

/**
 * Compares the declared and installed srvx versions. On mismatch
 * (including the `installed = null` case), throws an error whose
 * message names both versions, suggests `pnpm install`, and — this is
 * the #2018 invariant — does NOT suggest editing `server.mjs`. On
 * agreement, returns the equal pair.
 */
export const assertSrvxVersionsAgree = (source: VersionSource) => {
	const declared = source.readDeclared();
	const installed = source.readInstalled();
	if (installed === null) {
		// #2018: missing installed metadata → stale install, not source defect.
		throw new Error(
			`server-static-imports guard: '${SRVX_PACKAGE}' is declared at ` +
				`'${declared}' but the installed package metadata is absent at ` +
				`apps/front/node_modules/${SRVX_PACKAGE}/package.json. ` +
				`Run 'pnpm install' to sync the install with the declared dependency, ` +
				`then re-run this guard. Do not edit server.mjs until the installed ` +
				`version matches the declared version; this guard cannot diagnose the ` +
				`source while they disagree.`,
		);
	}
	if (declared !== installed) {
		// #2018: declared/installed mismatch → stale install. CI installs
		// with --frozen-lockfile, so CI never hits this; local clones do,
		// and local-only traps are the ones that get committed.
		throw new Error(
			`server-static-imports guard: '${SRVX_PACKAGE}' is declared at ` +
				`'${declared}' in apps/front/package.json but the installed copy ` +
				`reports '${installed}' (apps/front/node_modules/${SRVX_PACKAGE}/package.json). ` +
				`Run 'pnpm install' to sync the install with the declared dependency, ` +
				`then re-run this guard. Do not edit server.mjs until the installed ` +
				`version matches the declared version; this guard cannot diagnose the ` +
				`source while they disagree.`,
		);
	}
	return { declared, installed };
};

export const formatMissing = (
	missing: ReadonlyArray<MissingImport>,
): string[] => {
	const lines: string[] = [];
	for (const entry of missing) {
		const relativePath = path.relative(REPO_ROOT, SERVER_MJS);
		lines.push(
			`  ${relativePath}:${entry.line}  imports { ${entry.name} } ` +
				`from 'srvx/static' but srvx/static exports only ` +
				`[${[...entry.availableExports].sort(compareExports).join(', ')}].`,
		);
		lines.push(
			`    Node rejects this named import while loading server.mjs, before any ` +
				`call site runs, so the server exits before startup. Update server.mjs to ` +
				`import a name that ` +
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
 * returns `['staticMiddleware']`).
 *
 * `versions` (#2018) is an optional injection seam for the
 * declared-vs-installed check: production callers pass `undefined`
 * (the default reads the real `package.json` + `node_modules/srvx`);
 * tests pass a fixture `{ declared, installed }`. The check runs
 * FIRST: a stale install (declared ≠ installed) short-circuits the
 * source-shape check with a `pnpm install` message that never suggests
 * editing `server.mjs`. Only equal declared/installed versions may
 * proceed to diagnose the source — that ordering is the #2018
 * invariant. */
type ServerStaticImportCheck = {
	missing: MissingImport[];
	versions: ReturnType<typeof assertSrvxVersionsAgree>;
};

export const checkServerStaticImports = async (
	serverPath: string,
	loader: () => Promise<Record<string, unknown>>,
	versions?: VersionSource,
): Promise<ServerStaticImportCheck> => {
	const resolvedVersions = assertSrvxVersionsAgree(
		versions ?? defaultSrvxVersionSource(),
	);

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
	return { missing, versions: resolvedVersions };
};

const main = async (): Promise<void> => {
	if (!existsSync(SERVER_MJS)) {
		console.error(
			`server-static-imports guard: the file to scan does not exist — ` +
				`${SERVER_MJS}. The guard cannot report compliance for a file it never read.`,
		);
		process.exit(1);
	}

	let result: ServerStaticImportCheck;
	try {
		result = await checkServerStaticImports(
			SERVER_MJS,
			() => import('srvx/static'),
		);
	} catch (error: unknown) {
		console.error(formatGuardError(error));
		process.exit(1);
	}

	if (result.missing.length > 0) {
		console.error(
			`server-static-imports guard: server.mjs imports ${result.missing.length} ` +
				`name(s) from 'srvx/static' that the installed srvx does not export — ` +
				`Node will reject the named import while loading server.mjs ` +
				`(#1822 / #1872):`,
		);
		for (const line of formatMissing(result.missing)) {
			console.error(line);
		}
		process.exit(1);
	}

	const imports = findServerStaticImports(SERVER_MJS);
	console.log(
		`server-static-imports guard: ${imports.length} named import(s) from ` +
			`'srvx/static' in server.mjs all resolve to live srvx exports [OK] ` +
			`(srvx ${result.versions.declared} ` +
			`matches apps/front/package.json)`,
	);
};

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	void main();
}
