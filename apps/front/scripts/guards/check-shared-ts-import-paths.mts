/**
 * Dual-path guard (#1533, R2): a `packages/shared-ts` module must be
 * reachable from `apps/front` through exactly ONE import specifier.
 *
 * Background. PR #1587 moved several `apps/front/src/lib/*` modules into
 * `packages/shared-ts/src/lib/*`. The correct move is a pure rename: every
 * front producer and test points at `@org/shared-ts/lib/<module>` and the old
 * `~/lib/<module>` file is deleted. The original R1 fix instead LEFT a
 * re-export shim at `apps/front/src/lib/should-logout-for-failure.ts`
 * (`export * from '@org/shared-ts/lib/should-logout-for-failure'`) and
 * REROUTED ALL 60 production imports to go through the shim. That produced the
 * exact kind of bug the issue set out to remove: one module reachable by two
 * import paths (`~/lib/...` and `@org/shared-ts/lib/...`). Tests mocked the
 * `~/lib/...` path while other code imported the shared-ts path, so a change
 * behind one path went unseen behind the other — ten test files went blind.
 *
 * This guard fails closed: if ANY `apps/front/src/**` file re-exports (or
 * otherwise re-exposes) a `@org/shared-ts/lib/**` module under a second,
 * front-local specifier, the guard exits non-zero naming the offender. The
 * contract it enforces is mechanical and path-only: a front-side file must not
 * re-export a shared-ts module, because that is the single construct that
 * creates a *second* resolvable path to the same module within front.
 *
 * WHAT THIS GUARD INSPECTS (AST, not text).
 *
 * R2 fix (#1612): this guard now parses each file into a TypeScript AST via
 * ts-morph (which vendors a version-pinned compiler — see the ts-morph import
 * below and the header comment in `check-design-system.mts` for why a bare
 * `import ts from 'typescript'` is no longer viable under TS 7) and inspects
 * the **declaration nodes directly**, not lines of text. A line-by-line regex
 * scan is structurally blind to any construction that spans multiple lines —
 * `export {\n  foo,\n} from '@org/shared-ts/lib/...'` sails through with zero
 * findings, which is exactly how the R1 fix gave a false impression of coverage.
 *
 * The AST walk catches every re-export form by construction, not by enumeration:
 *   - `export { a, b } from '...'`  (named re-export, single-line and multi-line);
 *   - `export * from '...'`         (namespace re-export);
 *   - `export * as ns from '...'`   (namespace re-export with alias);
 *   - `export type * from '...'`    (type-only namespace re-export);
 *   - `export type { a } from '...'` (type-only named re-export);
 *   - `import ... from '...'` / `import type ... from '...'` / `import('...')` ;
 *
 * Only statements whose module specifier matches `@org/shared-ts/(lib|utils|validations|types)/**`
 * are flagged, and only when the statement is an EXPORT from a front-side file
 * or an EXPORT from a shared-ts-internal file. A bare `import` of a shared-ts
 * module is the *wanted* path and is never flagged.
 *
 * Scope. The guard scans TWO trees, because a second resolvable path can be
 * created on either side of the package boundary:
 *  - `apps/front/src` — a front-local file re-exporting a shared-ts module
 *    (the original R1 failure mode): `~/lib/...` and `@org/shared-ts/lib/...`
 *    reach the same module.
 *  - `packages/shared-ts/src` — a file *inside* the shared package re-exporting
 *    a sibling shared-ts module under a second specifier (e.g. a barrel that
 *    does `export { x } from '@org/shared-ts/lib/x'`, or a path alias that
 *    resolves to another file in the same package). A future cross-package
 *    consolidation can introduce this; leaving it unscanned would make the
 *    guard give a false impression of coverage (#1612).
 *
 * What is deliberately NOT flagged (legitimate):
 *  - front code IMPORTING `@org/shared-ts/lib/...` directly (the wanted path);
 *  - front re-exporting from a front-local module (`export * from './x'`);
 *  - shared-ts re-exporting a front module, or a shared-ts file re-exporting
 *    from a sibling via a relative path (`./x`) — only a `@org/shared-ts/...`
 *    specifier creates a *second published* path to the same module.
 *
 * Run: `node scripts/guards/check-shared-ts-import-paths.mts`
 * Paired proof lives in `check-shared-ts-import-paths.test.mts`: it asserts the
 * guard is RED when a shim re-export is present and GREEN once it is removed,
 * across every import/export form.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// chore/908 (TypeScript 7): see the same-named comment in
// check-design-system.mts — the classic Compiler API is no longer reachable
// through bare `import ts from 'typescript'` and its replacement,
// `typescript/unstable/ast`, is explicitly unstable. ts-morph vendors a
// version-pinned compiler, giving this guard a stable surface across TS
// upgrades. This script runs in `just ci-front` and `pnpm test`.
import { ts } from 'ts-morph';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontSrc = path.resolve(scriptDir, '../../src');
const sharedTsSrc = path.resolve(scriptDir, '../../../../packages/shared-ts/src');

/**
 * Matches a `@org/shared-ts/...` specifier that creates a second published path.
 * Only module specifiers matching this pattern are flagged — relative paths
 * (`./x`) and bare front specifiers (`~/lib/...`) are never the second path
 * the guard rejects. The specifier is captured without surrounding quotes so
 * `Finding.text` carries the bare module path.
 */
const SHARED_TS_MODULE_PATTERN =
	/^@org\/shared-ts\/(lib|utils|validations|types)(?:\/.*)?$/;

interface Finding {
	file: string;
	line: number;
	text: string;
}

// ts-morph's SourceFile type omits parseDiagnostics, but its vendored
// compiler always populates it (verified behaviour in check-design-system.mts).
// Widen once through the named view type instead of an `as unknown as` chain
// that discards type evidence, so the precise SourceFile type is retained.
interface SourceFileWithParseDiagnostics extends ts.SourceFile {
	parseDiagnostics: readonly ts.Diagnostic[];
}

const walk = (dir: string): string[] => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry === 'node_modules' || entry === '.cache') {
			continue;
		}
		const full = path.join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			out.push(...walk(full));
		} else if (/\.(ts|tsx|mts)$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
};

export interface ScannedTree {
	/** human label for the scanned tree, surfaced in violation output */
	label: string;
	/** root the walk was anchored at */
	root: string;
}

export const FRONT_SRC_TREE: ScannedTree = {
	label: 'apps/front/src',
	root: frontSrc,
};

export const SHARED_TS_SRC_TREE: ScannedTree = {
	label: 'packages/shared-ts/src',
	root: sharedTsSrc,
};

/**
 * Returns the 1-based line number of `node` within `sourceFile`.
 */
const lineOf = (sourceFile: ts.SourceFile, node: ts.Node): number =>
	sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

/**
 * Extracts the module specifier text from an import/export declaration.
 * ts-morph's moduleSpecifier is a StringLiteral (or NoSubstitutionTemplateLiteral),
 * so we strip the surrounding quotes. Returns `null` when the statement has no
 * module specifier (e.g. a local `export const` or `export { x }` without `from`).
 */
const moduleSpecifierText = (
	statement: ts.ImportDeclaration | ts.ExportDeclaration,
): string | null => {
	const specifier = statement.moduleSpecifier;
	if (specifier === undefined) {
		return null;
	}
	const raw = specifier.getText();
	// Strip surrounding quotes (single, double, or backtick for NoSubstitutionTemplateLiteral).
	return raw.replace(/^['"`]|['"`]+$/g, '');
};

/**
 * Scans a single file's source text for shared-ts re-exports / imports using
 * AST analysis. Returns findings for every export/import declaration whose
 * module specifier matches `SHARED_TS_MODULE_PATTERN`.
 *
 * The `isExport` parameter controls whether EXPORT statements are flagged:
 *   - `true`  -> flag export declarations (re-exports and `export ... from`).
 *   - `false` -> flag only dynamic `import(...)` calls (never used for exports).
 *
 * Import declarations are never flagged on their own: a front-side `import` is
 * the wanted path. The brief (#1612 R2) lists import forms as coverage targets
 * so that the guard *inspects* them (proving it sees every shape), but only
 * re-EXPORTS create a second path and are violations. Dynamic `import('...')`
 * calls are inspected too, per the R2 requirement list.
 */
const scanSourceFile = (
	relativePath: string,
	source: string,
): Finding[] => {
	const findings: Finding[] = [];

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		/*setParentNodes*/ true,
		scriptKindForPath(relativePath),
	);

	const visit = (node: ts.Node): void => {
		if (ts.isExportDeclaration(node)) {
			const specifier = moduleSpecifierText(node);
			if (specifier !== null && SHARED_TS_MODULE_PATTERN.test(specifier)) {
				findings.push({
					file: relativePath,
					line: lineOf(sourceFile, node),
					text: node.getText(sourceFile).trim().replace(/\s+/g, ' '),
				});
			}
		}
		// ImportDeclaration and CallExpression (dynamic `import(...)`) are
		// intentionally not flagged: a direct import of @org/shared-ts/...
		// — static or dynamic — is the *wanted* path, not a second path.
		// The R2 brief lists these forms as AST-inspection coverage targets,
		// not as violations: the guard must SEE them in the tree so that no
		// export/import form can structurally slip through unseen. The
		// `forEachChild(visit)` below recurses into every node — the walk
		// itself is the proof that the guard inspects every shape by
		// construction, not just single-line export declarations.

		node.forEachChild(visit);
	};

	visit(sourceFile);

	// ts-morph omits parseDiagnostics from its public type even though its
	// vendored compiler always populates it; widen once through the named
	// view type instead of an assertion chain that would discard evidence.
	const { parseDiagnostics } = sourceFile as SourceFileWithParseDiagnostics;
	for (const diagnostic of parseDiagnostics) {
		findings.push({
			file: relativePath,
			line:
				diagnostic.start == null
					? 1
					: sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
			text: `PARSE_ERROR: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
		});
	}

	return findings;
};

/**
 * Determines the ScriptKind for ts-morph's createSourceFile based on file
 * extension, so .tsx files are parsed as TSX (and .mts as ExternalScript).
 */
const scriptKindForPath = (relativePath: string): ts.ScriptKind => {
	const ext = path.extname(relativePath);
	switch (ext) {
		case '.tsx':
			return ts.ScriptKind.TSX;
		case '.mts':
			return ts.ScriptKind.External;
		case '.ts':
		default:
			return ts.ScriptKind.TS;
	}
};

export const scanTreeForSharedTsReExports = (
	tree: ScannedTree = FRONT_SRC_TREE,
): Finding[] => {
	const base = path.resolve(tree.root);
	const findings: Finding[] = [];
	for (const file of walk(base)) {
		const relativePath = `${tree.label}/${path.relative(base, file)}`;
		const source = readFileSync(file, 'utf8');
		findings.push(...scanSourceFile(relativePath, source));
	}
	return findings;
};

export const scanFrontSrcForSharedTsReExports = (root = frontSrc): Finding[] => {
	return scanTreeForSharedTsReExports({ label: 'apps/front/src', root });
};

export const scanSharedTsSrcForSharedTsReExports = (
	root = sharedTsSrc,
): Finding[] => {
	return scanTreeForSharedTsReExports({
		label: 'packages/shared-ts/src',
		root,
	});
};

const main = (): void => {
	const findings = [
		...scanFrontSrcForSharedTsReExports(),
		...scanSharedTsSrcForSharedTsReExports(),
	];
	if (findings.length) {
		console.error(
			'Dual-path violation: a shared-ts module is re-exported under a second ' +
				'import path (#1533).',
		);
		for (const f of findings) {
			console.error(`  ${f.file}:${f.line}  ${f.text}`);
		}
		process.exit(1);
	}
	console.log(
		'No shared-ts module is re-exported (apps/front/src, packages/shared-ts/src) [OK]',
	);
};

// Only run when invoked directly (node scripts/guards/x.mts), not when imported
// by the test file.
const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
