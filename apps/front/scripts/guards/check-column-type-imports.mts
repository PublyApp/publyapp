/**
 * Guard #1769: refuse `ColumnDef`, `Row` and `TanStackTable` imported from
 * `@tanstack/react-table` or `@tanstack/react-table/legacy`.
 *
 * Background. PR #1583 installed a mapped-type passthrough at
 * `apps/front/src/components/table/column-type.ts` so the rest of the table
 * stack imports `ColumnDef`/`Row`/`TanStackTable` from there — keeping the
 * `typescript/no-deprecated` suppression confined to that one file (and
 * `data-table.tsx`, which calls the deprecated `useLegacyTable` runtime value
 * directly). The confinement relies on `typescript/no-deprecated`, which
 * catches `@tanstack/react-table/legacy` but NOT the non-deprecated root —
 * so a developer who imports `ColumnDef` from `@tanstack/react-table` (v9)
 * instead of the passthrough gets twenty `TS7031: Binding element 'row'
 * implicitly has an 'any' type` errors very far from the cause. This is the
 * third occurrence (#1627, #1737).
 *
 * This guard fails closed: any import declaration whose module specifier is
 * `@tanstack/react-table` or `@tanstack/react-table/legacy` AND which imports
 * at least one of the three type names (`ColumnDef`, `Row`, `TanStackTable`)
 * from that specifier is flagged — UNLESS the importing file is the
 * passthrough itself (`column-type.ts`). The brief asked to verify whether
 * `data-table.tsx` needs an exemption; it does not import from
 * `@tanstack/react-table` at all (checked against the current tree), so it is
 * not listed as exempt.
 *
 * WHAT THIS GUARD INSPECTS (AST, not text).
 *
 * The guard parses each file into a TypeScript AST via ts-morph (which vendors
 * a version-pinned compiler — see the ts-morph import below and the header
 * comment in `check-design-system.mts` for why a bare
 * `import ts from 'typescript'` is no longer viable under TS 7) and inspects
 * the **import declaration nodes directly**, not lines of text. A line-by-line
 * regex scan is structurally blind to any construction that spans multiple
 * lines — `import {\n  ColumnDef,\n} from '@tanstack/react-table'` sails
 * through with zero findings, which is exactly the shape that shipped the
 * #1627 regression.
 *
 * The AST walk catches every import form by construction, not by enumeration:
 *   - `import { ColumnDef } from '@tanstack/react-table'` (named type import);
 *   - `import type { ColumnDef } from '@tanstack/react-table'` (type-only);
 *   - `import { ColumnDef, Row } from '@tanstack/react-table'` (multi-name);
 *   - `import { default as ColumnDef } from '@tanstack/react-table'` (aliased);
 *   - `import * as ns from '@tanstack/react-table'` (namespace — flagged if
 *     the namespace is used as one of the three types, but the guard flags the
 *     import specifier + message regardless, since a namespace import of the
 *     root module is itself the violation);
 *   - `import('@tanstack/react-table')` (dynamic import call — flagged because
 *     the specifier is the root and the brief requires it);
 *   - `import ReactTable = require('@tanstack/react-table')` (CommonJS-style
 *     import assignment — flagged because the specifier is the root module,
 *     which gives access to all banned types).
 *
 * KNOWN BLIND SPOT. The guard inspects the module specifier AS WRITTEN; it
 * does not perform module resolution. A tsconfig `paths` alias mapping a
 * local specifier (e.g. a `~/*` key) directly to `@tanstack/react-table`
 * would hide the banned module behind an innocent-looking import and this
 * guard could not see it. No such alias exists today
 * (`apps/front/tsconfig.json` maps only `~/*` → `./src/*`), but if one ever
 * lands, this guard would silently stop attending the real artifact — the
 * alias would have to be resolved before the AST walk is trustworthy again.
 *
 * Only imports whose module specifier is exactly `@tanstack/react-table` or
 * `@tanstack/react-table/legacy` are inspected. Imports of
 * `@tanstack/react-table/legacy` are ALWAYS flagged (the passthrough is the
 * only file allowed to touch the legacy module, and it is the only file in
 * the exemption list).
 *
 * What is deliberately NOT flagged (legitimate):
 *   - `import type { SortingState } from '@tanstack/react-table'` — not one
 *     of the three banned names;
 *   - `import { flexRender } from '@tanstack/react-table'` — not one of the
 *     three banned names;
 *   - `import type { ColumnDef } from '~/components/table/column-type'` —
 *     the wanted path;
 *   - `import type { ColumnDef } from './column-type'` — relative path to
 *     the passthrough;
 *   - `declare module '@tanstack/react-table'` — module augmentation, not an
 *     import.
 *
 * EXTENSION POLICY — reversed burden of proof (R4).
 *
 * The guard no longer enumerates which extensions to scan. Instead it walks
 * the tree, collects every distinct file extension it encounters, and then
 * demands that EACH one be either:
 *   - a SCANNED extension (code the AST parser handles), or
 *   - a declared NON_CODE extension (a short, commented blocklist).
 *
 * Any extension that is neither scanned nor declared fails the guard LOUDLY,
 * naming the offending extension. This closes the R3 defect where `.cts`,
 * `.cjs`, `.mjs` and `.ctsx` sailed through with `[OK]` because the regex
 * `/\.(ts|tsx|mts)$/` never looked at them — and where adding those four to
 * the regex would have reconcealed the next unknown extension (e.g. `.cjsx`).
 *
 * The non-code blocklist is short and every entry is commented with WHY it is
 * non-code. If a new non-code extension appears (e.g. `.webp`), the guard
 * fails until the developer consciously adds it to the blocklist — never a
 * silent pass.
 *
 * Run: `node scripts/guards/check-column-type-imports.mts`
 * Tests: `node --test scripts/guards/check-column-type-imports.test.mts`
 */
import { execFileSync } from 'node:child_process';
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
export const frontSrc = path.resolve(scriptDir, '../../src');

/**
 * The three type names that must NOT be imported from `@tanstack/react-table`
 * or `@tanstack/react-table/legacy`. The passthrough at `column-type.ts` is
 * the only sanctioned source.
 */
const BANNED_TYPE_NAMES = new Set(['ColumnDef', 'Row', 'TanStackTable']);

/**
 * The two module specifiers that are banned as sources for the three types.
 * Importing from `@tanstack/react-table/legacy` is ALWAYS flagged (the
 * passthrough is the only file allowed to touch the legacy module, and it is
 * in the exception list). Importing from `@tanstack/react-table` is flagged
 * only when one of the three banned names is among the imported bindings.
 */
const BANNED_SPECIFIERS = new Set([
	'@tanstack/react-table',
	'@tanstack/react-table/legacy',
]);

/**
 * Extensions that the guard's AST parser handles. A file with one of these
 * extensions is scanned for banned imports.
 *
 * R4: this set is the explicit list of CODE extensions. Any extension not in
 * this set AND not in NON_CODE_EXTENSIONS fails the guard loudly — so adding
 * a new code extension here is a conscious act, not a silent default.
 */
export const SCANNED_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.mts',
	'.cts', // CommonJS TypeScript (CommonJS module + TS syntax)
	'.ctsx', // CommonJS TypeScript with JSX
	'.mjs', // ES Module JavaScript
	'.cjs', // CommonJS JavaScript
]);

/**
 * R6 (Hole 2): extensions that the AST parser handles AND that can NEVER be
 * declared non-code. These four (.ts, .tsx, .mts, .cts) are the backbone of
 * the codebase — declaring any of them non-code would silently disable a
 * huge surface of analysis. This set makes the gesture structurally
 * impossible: assertCoreExtensionsScanned fails loudly if any core extension
 * is missing from SCANNED_EXTENSIONS, so a developer cannot remove a core
 * extension from the scan set at all.
 *
 * .mjs/.cjs/.ctsx are scanned (see SCANNED_EXTENSIONS) but are NOT core:
 * they may be absent from the tree today, and we must not force them into
 * the scan set. They are protected by the "still scanned" test in the suite,
 * not by this structural lock.
 */
export const CORE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

/** Preserve captured Git stderr when Node's process error omits it. */
export const formatGitCommandError = (error: unknown): string => {
	if (!(error instanceof Error)) {
		return String(error);
	}
	const stderrValue = 'stderr' in error ? error.stderr : undefined;
	const stderr = typeof stderrValue === 'string' ? stderrValue.trim() : '';
	if (stderr.length === 0 || error.message.includes(stderr)) {
		return error.message;
	}
	return `${error.message} stderr: ${stderr}`;
};

/**
 * R11 (#2033): the baseline pins scan policy, while the scan surface itself is
 * derived from the merge-base tree. A grow is accepted; a shrink fails unless
 * each removed code file is declared exactly and remains present in the
 * integration reference while the deletion branch is waiting to integrate.
 */
export interface ScanBaseline {
	/** Pinned SCANNED_EXTENSIONS — any addition or removal fails. */
	scannedExtensions: string[];
	/** Pinned NON_CODE_EXTENSIONS — any addition, removal, or justification change fails. */
	nonCodeExtensions: Record<string, string>;
	/** Pinned EXEMPT_FILES — any addition or removal fails. */
	exemptFiles: string[];
	/** Exact repo-relative code files deliberately deleted in this PR. */
	intentionalDeletions: string[];
}

/**
 * Extensions that are legitimately present under the scanned root but are
 * NOT code and must NEVER be scanned. Each entry carries a mandatory
 * justification (the value) — the guard fails loudly if any entry's
 * justification is empty or whitespace-only. This makes the "comment is
 * proof" claim true: an exclusion without a visible reason is rejected,
 * so a developer cannot silently add an exclusion without explaining why.
 *
 * R5 (Hole 3): the justification is no longer a conventional comment that
 * nobody checks — it is a structural requirement enforced by the guard.
 */
export const NON_CODE_EXTENSIONS = new Map<string, string>([
	['.json', 'static data (e.g. translation files), never imports code'],
	['.css', 'style declarations, never imports code'],
	['.svg', 'vector graphics, never imports code'],
]);

/**
 * R7: the set of files that are exempt from scanning. Only
 * `column-type.ts` is exempt — it is the passthrough itself. This set is
 * pinned in column-type-imports-baseline.json; any addition fails the guard
 * via assertExemptionsPinned.
 *
 * The brief asked to verify whether `data-table.tsx` needs an exemption; it
 * does not import from `@tanstack/react-table` (checked against the current
 * tree), so it is not listed here.
 */
export const EXEMPT_FILES = new Set(['components/table/column-type.ts']);

/**
 * Determines whether `normalizedPath` (relative to the scanned root) refers
 * to an exempt file. The scanned root may be `apps/front/src` (production)
 * or a test sandbox under `scripts/guards/`. In production the path is
 * `components/table/column-type.ts`; in tests it may include the full
 * `apps/front/src/...` prefix or be relative to a scripts/guards/ root.
 *
 * Only `column-type.ts` is exempt — it is the passthrough itself.
 *
 * R8: `isExempt` derives from the pinned `EXEMPT_FILES` set, which is itself
 * asserted against the baseline by `assertExemptionsPinned`. After this fix,
 * it is impossible to exempt a file without modifying `EXEMPT_FILES` — and
 * every modification to `EXEMPT_FILES` is caught by the pin assertion. The
 * function matches by basename AND by relative suffix, so a test sandbox with
 * a different root still resolves to the same exempt file. The suffix match
 * is restricted to entries that are known to be in EXEMPT_FILES, so a hardcoded
 * `||` clause can never bypass the pin.
 */
export const isExempt = (normalizedPath: string): boolean => {
	const normalized = normalizedPath.split(path.sep).join('/');
	for (const exempt of EXEMPT_FILES) {
		const suffix = exempt.split(path.sep).join('/');
		if (normalized === suffix || normalized.endsWith('/' + suffix)) {
			return true;
		}
	}
	return false;
};

/** The replacement the message points to. */
const REPLACEMENT = '~/components/table/column-type';

interface Finding {
	file: string;
	line: number;
	/** The banned specifier that triggered the finding. */
	specifier: string;
	/** The imported binding name(s) that triggered the finding. */
	bindings: string[];
}

/**
 * Formats a finding into a human-readable message. The message names the
 * file, the banned specifier, the offending bindings, and the exact
 * replacement — per the repo's "transparent failure causes" rule (every
 * failure names its cause AND the next action).
 */
export const formatFinding = (f: Finding): string =>
	`${f.file}:${f.line}  import { ${f.bindings.join(', ')} } from '${f.specifier}' — ` +
	`import from '${REPLACEMENT}' instead (#1769).`;

/**
 * Returns the 1-based line number of `node` within `sourceFile`.
 */
const lineOf = (sourceFile: ts.SourceFile, node: ts.Node): number =>
	sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

/**
 * Determines the ScriptKind for ts-morph's createSourceFile based on file
 * extension, so .tsx/.ctsx files are parsed as TSX, .mts/.mjs as External
 * (ES module), and .cjs as JS (CommonJS JavaScript).
 */
const scriptKindForPath = (relativePath: string): ts.ScriptKind => {
	const ext = path.extname(relativePath);
	switch (ext) {
		case '.tsx':
		case '.ctsx':
			return ts.ScriptKind.TSX;
		case '.mts':
		case '.mjs':
			return ts.ScriptKind.External;
		case '.cjs':
			return ts.ScriptKind.JS;
		case '.cts':
			return ts.ScriptKind.TS;
		case '.ts':
		default:
			return ts.ScriptKind.TS;
	}
};

/**
 * Extracts the module specifier text from an import declaration.
 * Returns `null` when the statement has no module specifier.
 */
const moduleSpecifierText = (
	statement: ts.ImportDeclaration,
): string | null => {
	const specifier = statement.moduleSpecifier;
	if (specifier === undefined) {
		return null;
	}
	const raw = specifier.getText();
	return raw.replace(/^['"`]|['"`]+$/g, '');
};

/**
 * Returns the imported binding names from an import declaration that match
 * the banned set. Handles:
 *   - named imports (`import { ColumnDef } from '...'`)
 *   - default imports (`import ColumnDef from '...'`) — matched by name
 *   - namespace imports (`import * as ColumnDef from '...'`) — matched by alias
 * Returns an empty array when no banned name is among the bindings.
 */
const bannedBindingsFromImport = (node: ts.ImportDeclaration): string[] => {
	const found: string[] = [];
	const clause = node.importClause;

	if (clause === undefined) {
		// Side-effect import (`import '...'`) — no bindings to check, but the
		// specifier is still banned. Return a sentinel so the caller can
		// report the import as a violation with a clear message.
		return ['(side-effect import)'];
	}

	// Default import: `import ColumnDef from '...'`
	const defaultName = clause.name;
	if (defaultName !== undefined && BANNED_TYPE_NAMES.has(defaultName.text)) {
		found.push(defaultName.text);
	}

	// Named bindings: `import { ColumnDef, Row } from '...'`
	const namedBindings = clause.namedBindings;
	if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) {
		for (const element of namedBindings.elements) {
			// `element.name` is the local name; `element.propertyName` is the
			// exported name (when aliased, e.g. `import { foo as ColumnDef }`).
			// Check BOTH: `import { ColumnDef as X }` brings the banned name
			// into scope; `import { X as ColumnDef }` creates a banned alias.
			const exportedName = element.propertyName ?? element.name;
			if (
				BANNED_TYPE_NAMES.has(exportedName.text) ||
				BANNED_TYPE_NAMES.has(element.name.text)
			) {
				found.push(element.name.text);
			}
		}
	}

	// Namespace import: `import * as ReactTable from '...'`
	// A namespace import from a banned specifier gives access to ALL exports,
	// including the banned types, so it's always a violation — regardless of
	// the namespace alias name.
	if (namedBindings !== undefined && ts.isNamespaceImport(namedBindings)) {
		const alias = namedBindings.name.text;
		if (BANNED_TYPE_NAMES.has(alias)) {
			found.push(alias);
		} else {
			found.push('(namespace import)');
		}
	}

	return found;
};

/**
 * Scans a single file's source text for banned imports using AST analysis.
 * Returns findings for every import declaration whose module specifier is
 * one of the banned specifiers AND which imports at least one banned type
 * name (or is a side-effect import from a banned specifier).
 */
const scanSourceFile = (relativePath: string, source: string): Finding[] => {
	const findings: Finding[] = [];

	const sourceFile = ts.createSourceFile(
		relativePath,
		source,
		ts.ScriptTarget.Latest,
		/*setParentNodes*/ true,
		scriptKindForPath(relativePath),
	);

	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node)) {
			const specifier = moduleSpecifierText(node);
			if (specifier !== null && BANNED_SPECIFIERS.has(specifier)) {
				const bindings = bannedBindingsFromImport(node);
				const isLegacy = specifier === '@tanstack/react-table/legacy';
				// Legacy specifier is ALWAYS flagged (the passthrough is the
				// only file allowed to touch it, and it's in EXEMPT_FILES).
				// Root specifier is flagged when a banned binding is imported,
				// or when it's a side-effect import (no import clause).
				if (isLegacy || bindings.length > 0) {
					// `oxlint` interdit les ternaires imbriques : on calcule la branche
					// heritee en amont. Semantique inchangee.
					const legacyBindings =
						bindings.length > 0 ? bindings : ['(legacy specifier)'];
					findings.push({
						file: relativePath,
						line: lineOf(sourceFile, node),
						specifier,
						bindings: isLegacy ? legacyBindings : bindings,
					});
				}
			}
		}

		// Re-export shim: `export { ColumnDef } from '@tanstack/react-table'`.
		// An ExportDeclaration with a module specifier is a re-export; if the
		// specifier is banned and the exported name is one of the banned types,
		// flag it. Legacy re-exports are always flagged.
		if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
			const rawSpecifier = node.moduleSpecifier.getText();
			const specifier = rawSpecifier.replace(/^['"`]|['"`]+$/g, '');
			if (specifier !== null && BANNED_SPECIFIERS.has(specifier)) {
				const isLegacy = specifier === '@tanstack/react-table/legacy';
				// A wildcard re-export (`export * from '...'`) has no
				// exportClause and re-exports ALL exports, including the
				// banned types.
				const isWildcard = node.exportClause === undefined;
				const exportedNames: string[] = [];
				if (
					node.exportClause !== undefined &&
					ts.isNamedExports(node.exportClause)
				) {
					for (const element of node.exportClause.elements) {
						const exportedName = element.propertyName ?? element.name;
						if (BANNED_TYPE_NAMES.has(exportedName.text)) {
							exportedNames.push(element.name.text);
						}
					}
				}
				if (isLegacy || isWildcard || exportedNames.length > 0) {
					// `oxlint` interdit les ternaires imbriques : on calcule la
					// branche en amont. Semantique inchangee.
					let bindings: string[];
					if (exportedNames.length > 0) {
						bindings = exportedNames;
					} else if (isWildcard) {
						bindings = ['(wildcard re-export)'];
					} else {
						bindings = ['(legacy re-export)'];
					}
					findings.push({
						file: relativePath,
						line: lineOf(sourceFile, node),
						specifier,
						bindings,
					});
				}
			}
		}

		// Dynamic `import('...')` calls — flagged if the specifier is banned.
		// A dynamic import is a CallExpression whose expression is the
		// `import` keyword (SyntaxKind.ImportKeyword).
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length > 0
		) {
			const firstArg = node.arguments[0];
			if (ts.isStringLiteralLike(firstArg)) {
				const specifier = firstArg.text;
				if (BANNED_SPECIFIERS.has(specifier)) {
					findings.push({
						file: relativePath,
						line: lineOf(sourceFile, node),
						specifier,
						bindings: ['(dynamic import)'],
					});
				}
			}
		}

		// `require()` call: `const ReactTable = require('@tanstack/react-table')`.
		// A require call with a banned specifier brings the same root types
		// into scope. Only flag when the callee is an unqualified `require`
		// identifier (not a method call like `foo.require(...)`) and the
		// first argument is a string literal whose value is a banned specifier.
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'require' &&
			node.arguments.length > 0
		) {
			const firstArg = node.arguments[0];
			if (ts.isStringLiteralLike(firstArg)) {
				const specifier = firstArg.text;
				if (BANNED_SPECIFIERS.has(specifier)) {
					findings.push({
						file: relativePath,
						line: lineOf(sourceFile, node),
						specifier,
						bindings: ['(require call)'],
					});
				}
			}
		}

		// `import X = require('...')` (ImportEqualsDeclaration) — the
		// CommonJS-style import assignment. The right-hand side is an
		// `ExternalModuleReference` whose expression is a StringLiteral (not
		// a CallExpression), so neither the import-declaration handler nor the
		// require-call handler above fires. A banned specifier here gives
		// access to all exports, including the banned types.
		if (ts.isImportEqualsDeclaration(node)) {
			const moduleRef = node.moduleReference;
			if (
				moduleRef !== undefined &&
				ts.isExternalModuleReference(moduleRef) &&
				ts.isStringLiteralLike(moduleRef.expression)
			) {
				const specifier = moduleRef.expression.text;
				if (BANNED_SPECIFIERS.has(specifier)) {
					findings.push({
						file: relativePath,
						line: lineOf(sourceFile, node),
						specifier,
						bindings: ['(import = require)'],
					});
				}
			}
		}

		node.forEachChild(visit);
	};

	visit(sourceFile);

	return findings;
};

/** Result of walking a directory: scanned files + every extension seen. */
interface WalkResult {
	/** Files with a scanned extension (code the AST parser handles). */
	files: string[];
	/** Every distinct file extension found under `dir` (including non-code). */
	extensions: Set<string>;
}

/**
 * Recursively walks `dir`. Returns every file with a scanned extension AND
 * the set of ALL distinct file extensions encountered (scanned or not).
 *
 * The caller validates that every extension in `extensions` is either scanned
 * or explicitly declared as non-code — any other extension fails the guard
 * loudly (reversed burden of proof).
 */
export const walk = (dir: string): WalkResult => {
	const files: string[] = [];
	const extensions = new Set<string>();
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch (err) {
		throw new Error(
			`Guard #1769: cannot read directory '${dir}'. ` +
				`The guard cannot verify the ban without scanning every file.`,
			{ cause: err },
		);
	}
	for (const entry of entries) {
		if (entry === 'node_modules' || entry === '.cache' || entry === '.turbo') {
			continue;
		}
		const full = path.join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			const sub = walk(full);
			for (const f of sub.files) {
				files.push(f);
			}
			for (const e of sub.extensions) {
				extensions.add(e);
			}
		} else {
			const ext = path.extname(entry).toLowerCase();
			if (ext.length > 0) {
				extensions.add(ext);
			}
			// Extensionless files are treated as code and scanned (fail
			// closed): a file without extension can contain banned imports
			// just as easily as a .ts file, so the guard must not let it
			// escape analysis. The default ScriptKind (TS) in
			// scriptKindForPath handles the parse. An extensionless file
			// is NOT added to `extensions` — it has no extension to track
			// or validate — it is simply scanned and that is enough.
			if (ext.length === 0 || SCANNED_EXTENSIONS.has(ext)) {
				files.push(full);
			}
		}
	}
	return { files, extensions };
};

/**
 * R5 (Hole 2): asserts that the scanned-extensions set and the non-code
 * extensions map are disjoint. An extension cannot be BOTH scanned AND
 * declared non-code — that would silently disable its analysis, which is
 * exactly the defect the reversal was meant to prevent. Throws naming the
 * overlapping extension(s) when the invariant is violated.
 */
export const assertNoOverlap = (
	scanned: Set<string>,
	nonCode: Map<string, string>,
): void => {
	const overlap = [...nonCode.keys()].filter((ext) => scanned.has(ext));
	if (overlap.length > 0) {
		throw new Error(
			`Guard #1769: NON_CODE_EXTENSIONS overlaps SCANNED_EXTENSIONS ` +
				`(${overlap.sort().join(', ')}). An extension cannot be both ` +
				`scanned AND declared non-code — this would silently disable ` +
				`its analysis. Remove the extension from one set.`,
		);
	}
};

/**
 * R6 (Hole 3): asserts that every NON_CODE_EXTENSIONS entry carries a
 * justification of at least 24 characters. The previous bar (non-empty) let
 * one-character justifications like 'x' or 'todo' pass — a cosmetic bar.
 * The repo already applies this real bar elsewhere: 24 characters minimum
 * for analysis-suppression justifications (#1736). We align on it. An entry
 * with a too-short reason throws naming the offending extension(s).
 */
export const assertAllJustified = (nonCode: Map<string, string>): void => {
	const entriesWithoutJustification = [...nonCode.entries()].filter(
		([, reason]) => reason.trim().length < 24,
	);
	if (entriesWithoutJustification.length > 0) {
		const names = entriesWithoutJustification
			.map(([ext]) => ext)
			.sort()
			.join(', ');
		throw new Error(
			`Guard #1769: NON_CODE_EXTENSIONS has entry(ies) with a ` +
				`justification shorter than 24 characters (${names}). Every ` +
				`non-code exclusion must carry a reason that is substantive ` +
				`enough to explain why it is non-code — see #1736.`,
		);
	}
};

/**
 * R6 (Hole 2): asserts that every CORE_EXTENSIONS member is present in
 * SCANNED_EXTENSIONS. A developer who removes a core extension (like .tsx)
 * from the scan set would silently disable a huge surface of analysis.
 * This structural check makes the gesture impossible: the guard fails loudly
 * naming the missing core extension(s). Throws when the invariant is
 * violated.
 */
export const assertCoreExtensionsScanned = (
	scanned: Set<string>,
	core: Set<string>,
): void => {
	const missing = [...core].filter((ext) => !scanned.has(ext));
	if (missing.length > 0) {
		throw new Error(
			`Guard #1769: CORE_EXTENSIONS member(s) ${missing.sort().join(', ')} ` +
				`are missing from SCANNED_EXTENSIONS. These extensions are the ` +
				`backbone of the codebase and can never be removed from the scan ` +
				`set — doing so would silently disable their analysis.`,
		);
	}
};

/**
 * R11 (#2033): compares the live scan surface with its merge-base reference.
 * Fails loudly when `liveCounts` drops below `mergeBaseCounts` on any
 * extension; passes silently on a grow. The signature is split (live vs
 * merge-base count) so the helper is unit-testable without `git`, and the
 * integration layer (`scanFrontSrcForBannedImports`) is the only place that
 * talks to `git merge-base` / `git ls-tree`. See the helper-level JSDoc
 * for the full design rationale and the two scenarios it closes.
 */
export const assertNoShrinkVsMergeBase = (
	liveCounts: Record<string, number>,
	mergeBaseCounts: Record<string, number>,
): void => {
	const violations: string[] = [];
	for (const [ext, base] of Object.entries(mergeBaseCounts)) {
		const live = liveCounts[ext] ?? 0;
		if (live < base) {
			violations.push(
				`${ext}: base ${base}, live ${live} (gap of ${base - live})`,
			);
		}
	}
	if (violations.length > 0) {
		throw new Error(
			`Guard #1769: scan surface has shrunk below the merge-base count —\n  ` +
				violations.sort().join('\n  ') +
				`\nThe analyzed surface has silently shrunk against the merge ` +
				`base. The merge-base count is the file count at the common ` +
				`ancestor of HEAD and origin/develop; a live count below it ` +
				`indicates files were removed between the merge base and the ` +
				`PR tip. If a code file was intentionally deleted, declare that ` +
				`exact repo-relative path in the baseline; counts never accept slack.`,
		);
	}
};

/**
 * R11 (#2033): returns the common-ancestor commit of `HEAD` and the given
 * integration branch (default `origin/develop`). Throws if the merge base
 * cannot be computed — the shrink-only check requires an authoritative
 * reference, and a missing one would silently pass regressions.
 */
export const resolveMergeBase = (
	cwd: string,
	integrationBranch = 'origin/develop',
): string => {
	if (integrationBranch.trim().length === 0) {
		throw new Error(
			`Guard #1769: cannot resolve a merge base with an empty integration ` +
				`branch reference. Supply a fetched branch such as 'origin/develop'.`,
		);
	}
	try {
		const out = execFileSync('git', ['merge-base', 'HEAD', integrationBranch], {
			cwd: path.resolve(cwd),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const sha = out.trim();
		if (sha.length === 0) {
			throw new Error('empty merge-base SHA');
		}
		return sha;
	} catch (err) {
		throw new Error(
			`Guard #1769: cannot resolve the merge base between HEAD and ` +
				`'${integrationBranch}'. The shrink-only check requires an ` +
				`authoritative reference; a missing merge base would silently ` +
				`pass regressions. Verify that '${integrationBranch}' is fetched ` +
				`and reachable from HEAD. (${formatGitCommandError(err)})`,
		);
	}
};

/**
 * R11 (#2033): list files under `<ref>:<scannedSubtree>` from an explicitly
 * anchored repository. An empty reference or an empty tree is a hard failure,
 * never an empty successful result that could make a shrink look like a grow.
 */
export const listFilesAtRef = (
	ref: string,
	scannedSubtree: string,
	cwd: string,
): string[] => {
	if (ref.trim().length === 0) {
		throw new Error(
			`Guard #1769: cannot list files with an empty Git reference. ` +
				`The shrink-only check requires a non-empty merge-base SHA.`,
		);
	}
	if (scannedSubtree.trim().length === 0) {
		throw new Error(
			`Guard #1769: cannot list files for an empty scanned subtree. ` +
				`The Git scan must be anchored to a concrete source directory.`,
		);
	}
	let out: string;
	try {
		out = execFileSync(
			'git',
			['ls-tree', '-r', '-z', '--name-only', ref, '--', scannedSubtree],
			{
				cwd: path.resolve(cwd),
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
	} catch (err) {
		throw new Error(
			`Guard #1769: cannot list files at '${ref}' under '${scannedSubtree}'. ` +
				`The shrink-only check requires a readable tree at the merge ` +
				`base; a missing tree would silently pass regressions. ` +
				`(${formatGitCommandError(err)})`,
		);
	}
	const files = out
		.split('\0')
		.filter((file) => file.length > 0)
		.map((file) => file.split(path.sep).join('/'));
	if (files.length === 0) {
		throw new Error(
			`Guard #1769: Git reference '${ref}' has no files under ` +
				`'${scannedSubtree}'. The reference tree is empty or the scan path ` +
				`is wrong; refusing to treat that as a verified no-shrink result.`,
		);
	}
	return files;
};

/** Counts files per extension in an anchored committed tree. */
export const countExtensionsAtRef = (
	ref: string,
	scannedSubtree: string,
	cwd: string,
) => {
	const files = listFilesAtRef(ref, scannedSubtree, cwd);
	const counts: Record<string, number> = {};
	for (const file of files) {
		const ext = path.extname(file).toLowerCase();
		if (ext.length === 0) {
			continue;
		}
		counts[ext] = (counts[ext] ?? 0) + 1;
	}
	return counts;
};

const normalizedGitPath = (value: string): string =>
	value.split(path.sep).join('/');

const isScannedCodePath = (file: string): boolean => {
	const ext = path.extname(file).toLowerCase();
	return ext.length === 0 || SCANNED_EXTENSIONS.has(ext);
};

/**
 * Allows only exact, repo-relative declarations for code files that are
 * actually present at the merge base and absent from the live tree. The same
 * file must still be present in the integration reference, otherwise the
 * declaration has outlived the integration it was temporary evidence for. A
 * count, directory, glob, stale path, or duplicate declaration is never
 * accepted.
 */
export const assertIntentionalDeletions = (
	mergeBaseFiles: string[],
	liveFiles: string[],
	declaredDeletions: string[],
	scannedSubtree: string,
	integrationFiles: string[],
): string[] => {
	const normalizedSubtree = normalizedGitPath(scannedSubtree).replace(
		/\/$/,
		'',
	);
	const mergeBaseCodeFiles = new Set(
		mergeBaseFiles.map(normalizedGitPath).filter(isScannedCodePath),
	);
	const liveCodeFiles = new Set(
		liveFiles.map(normalizedGitPath).filter(isScannedCodePath),
	);
	const integrationCodeFiles = new Set(
		integrationFiles.map(normalizedGitPath).filter(isScannedCodePath),
	);
	const actualDeletions = [...mergeBaseCodeFiles].filter(
		(file) => !liveCodeFiles.has(file),
	);
	const declared = new Set<string>();
	const duplicates: string[] = [];
	const invalid: string[] = [];
	for (const raw of declaredDeletions) {
		const file = normalizedGitPath(raw);
		if (declared.has(file)) {
			duplicates.push(file);
			continue;
		}
		declared.add(file);
		const isInSubtree =
			file === normalizedSubtree || file.startsWith(`${normalizedSubtree}/`);
		if (
			file.length === 0 ||
			file.startsWith('/') ||
			file.includes('/../') ||
			file === '..' ||
			file.startsWith('../') ||
			!isInSubtree ||
			!isScannedCodePath(file) ||
			!mergeBaseCodeFiles.has(file)
		) {
			invalid.push(file);
		}
	}
	const undeclared = actualDeletions.filter((file) => !declared.has(file));
	const stale = [...declared].filter((file) => !actualDeletions.includes(file));
	const expired = [...declared].filter(
		(file) => !integrationCodeFiles.has(file),
	);
	if (
		duplicates.length > 0 ||
		invalid.length > 0 ||
		undeclared.length > 0 ||
		stale.length > 0 ||
		expired.length > 0
	) {
		const parts: string[] = [];
		if (duplicates.length > 0) {
			parts.push(`duplicate: ${duplicates.sort().join(', ')}`);
		}
		if (invalid.length > 0) {
			parts.push(`invalid: ${invalid.sort().join(', ')}`);
		}
		if (undeclared.length > 0) {
			parts.push(`undeclared: ${undeclared.sort().join(', ')}`);
		}
		if (stale.length > 0) {
			parts.push(`stale: ${stale.sort().join(', ')}`);
		}
		if (expired.length > 0) {
			parts.push(
				`stale against integration reference: ${expired.sort().join(', ')}`,
			);
		}
		throw new Error(
			`Guard #1769: intentional deletion declaration does not exactly ` +
				`match code files removed from the merge-base tree — ${parts.join('; ')}. ` +
				`Declare each deleted file by its exact repo-relative path; do not use ` +
				`counts, directories, globs, or slack.`,
		);
	}
	return actualDeletions;
};

/**
 * R7 (Hole 1): asserts that the runtime EXEMPT_FILES set matches the pinned
 * baseline exactly. The r6 reviewer showed that adding a single
 * `|| normalizedPath.endsWith('components/table/data-table-header-row.tsx')`
 * to isExempt keeps the real-tree guard green (748 files scanned, 0 findings)
 * AND all 53 tests green, while silently exempting a real file that contains
 * banned @tanstack/react-table imports. The floor check does not catch this
 * because walk() still counts the file — isExempt runs AFTER the count.
 *
 * Pinning the exempt set in the committed baseline makes this gesture
 * visible: any addition to EXEMPT_FILES fails the guard loudly, naming the
 * diverging path(s). The justification bar (24 chars) is not a semantic check
 * — it is a cosmetic barrier. The only robust protection is to pin the set
 * itself so that any change is a visible, reviewable commit.
 */
export const assertExemptionsPinned = (
	exemptFiles: Set<string>,
	baseline: ScanBaseline,
): void => {
	const pinned = new Set(baseline.exemptFiles);
	const added = [...exemptFiles].filter((f) => !pinned.has(f));
	const removed = [...pinned].filter((f) => !exemptFiles.has(f));
	if (added.length > 0 || removed.length > 0) {
		const parts: string[] = [];
		if (added.length > 0) {
			parts.push(`added: ${added.sort().join(', ')}`);
		}
		if (removed.length > 0) {
			parts.push(`removed: ${removed.sort().join(', ')}`);
		}
		throw new Error(
			`Guard #1769: EXEMPT_FILES has diverged from the pinned baseline — ` +
				parts.join('; ') +
				`. The exempt set is pinned in ` +
				`column-type-imports-baseline.json. To change it, edit the ` +
				`baseline and let the diff make the change visible in review.`,
		);
	}
};

/**
 * R7 (Hole 2): asserts that the runtime NON_CODE_EXTENSIONS map matches the
 * pinned baseline exactly — both the set of extensions AND their
 * justifications. The r6 reviewer showed that a 24-char string of 'a' passes
 * assertAllJustified, so the length bar is not a semantic check. Pinning the
 * full map makes any addition, removal, or justification change visible.
 */
export const assertNonCodeExtensionsPinned = (
	nonCode: Map<string, string>,
	baseline: ScanBaseline,
): void => {
	const pinned = new Map(Object.entries(baseline.nonCodeExtensions));
	const pinnedKeys = new Set(pinned.keys());
	const actualKeys = new Set(nonCode.keys());
	const added = [...actualKeys].filter((k) => !pinnedKeys.has(k));
	const removed = [...pinnedKeys].filter((k) => !actualKeys.has(k));
	const changed: string[] = [];
	for (const [key, pinnedValue] of pinned) {
		if (actualKeys.has(key) && nonCode.get(key) !== pinnedValue) {
			changed.push(key);
		}
	}
	if (added.length > 0 || removed.length > 0 || changed.length > 0) {
		const parts: string[] = [];
		if (added.length > 0) {
			parts.push(`added: ${added.sort().join(', ')}`);
		}
		if (removed.length > 0) {
			parts.push(`removed: ${removed.sort().join(', ')}`);
		}
		if (changed.length > 0) {
			parts.push(`justification changed: ${changed.sort().join(', ')}`);
		}
		throw new Error(
			`Guard #1769: NON_CODE_EXTENSIONS has diverged from the pinned ` +
				`baseline — ${parts.join('; ')}. The non-code set is pinned ` +
				`in column-type-imports-baseline.json. To change it, edit ` +
				`the baseline and let the diff make the change visible in ` +
				`review.`,
		);
	}
};

/**
 * R7 (Hole 3): asserts that the runtime SCANNED_EXTENSIONS set matches the
 * pinned baseline exactly. Removing an extension from SCANNED_EXTENSIONS and
 * adding it to NON_CODE_EXTENSIONS must never silently pass the real-tree
 * guard.
 *
 * Pinning the scanned set makes this gesture visible at the guard level: any
 * addition or removal fails loudly, naming the diverging extension(s).
 */
export const assertScannedExtensionsPinned = (
	scanned: Set<string>,
	baseline: ScanBaseline,
): void => {
	const pinned = new Set(baseline.scannedExtensions);
	const added = [...scanned].filter((e) => !pinned.has(e));
	const removed = [...pinned].filter((e) => !scanned.has(e));
	if (added.length > 0 || removed.length > 0) {
		const parts: string[] = [];
		if (added.length > 0) {
			parts.push(`added: ${added.sort().join(', ')}`);
		}
		if (removed.length > 0) {
			parts.push(`removed: ${removed.sort().join(', ')}`);
		}
		throw new Error(
			`Guard #1769: SCANNED_EXTENSIONS has diverged from the pinned ` +
				`baseline — ${parts.join('; ')}. The scanned set is pinned ` +
				`in column-type-imports-baseline.json. To change it, edit ` +
				`the baseline and let the diff make the change visible in ` +
				`review.`,
		);
	}
};

export interface ScanOptions {
	/**
	 * Repository root used as `cwd` for every Git subprocess. Test-only
	 * off-switch: when `scanFrontSrcForBannedImports` receives a sandbox root
	 * other than `frontSrc` and this is omitted, Git reference validation is
	 * intentionally disabled. Tests that exercise Git must pass this explicitly.
	 */
	gitCwd?: string;
	/** Integration branch or ref used to find the merge base. */
	integrationBranch?: string;
	/** Baseline path override used only by isolated integration tests. */
	baselinePath?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const readScanBaseline = (baselinePath: string): ScanBaseline => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(baselinePath, 'utf8')) as unknown;
	} catch (err) {
		throw new Error(
			`Guard #1769: cannot read scan-surface baseline '${baselinePath}'. ` +
				`The guard cannot verify the scan surface without valid JSON.`,
			{ cause: err },
		);
	}
	if (!isRecord(parsed)) {
		throw new Error(
			`Guard #1769: scan-surface baseline '${baselinePath}' must be a JSON object.`,
		);
	}
	if ('perExtension' in parsed) {
		throw new Error(
			`Guard #1769: scan-surface baseline '${baselinePath}' still contains ` +
				`obsolete authored perExtension floors. Remove them; the reference is ` +
				`derived from the anchored merge-base tree.`,
		);
	}
	if (
		!Array.isArray(parsed.scannedExtensions) ||
		!Array.isArray(parsed.exemptFiles) ||
		!Array.isArray(parsed.intentionalDeletions) ||
		!isRecord(parsed.nonCodeExtensions)
	) {
		throw new Error(
			`Guard #1769: scan-surface baseline '${baselinePath}' has an invalid ` +
				`shape. It must declare scannedExtensions, nonCodeExtensions, ` +
				`exemptFiles, and intentionalDeletions.`,
		);
	}
	const stringArrays = [
		parsed.scannedExtensions,
		parsed.exemptFiles,
		parsed.intentionalDeletions,
	];
	for (const values of stringArrays) {
		if (values.some((value) => typeof value !== 'string')) {
			throw new Error(
				`Guard #1769: scan-surface baseline '${baselinePath}' contains ` +
					`a non-string path or extension.`,
			);
		}
	}
	for (const value of Object.values(parsed.nonCodeExtensions)) {
		if (typeof value !== 'string') {
			throw new Error(
				`Guard #1769: scan-surface baseline '${baselinePath}' contains a ` +
					`non-string non-code justification.`,
			);
		}
	}
	return {
		scannedExtensions: parsed.scannedExtensions as string[],
		nonCodeExtensions: parsed.nonCodeExtensions as Record<string, string>,
		exemptFiles: parsed.exemptFiles as string[],
		intentionalDeletions: parsed.intentionalDeletions as string[],
	};
};

/**
 * Scans the front source tree for banned imports.
 * @param root Override the root directory (used by tests).
 */
export const scanFrontSrcForBannedImports = (
	rootPath: string = frontSrc,
	options: ScanOptions = {},
): Finding[] => {
	const root = path.resolve(rootPath);
	// Verify the scan root exists and is a directory. A missing root is a
	// different failure from an empty root — the messages say which.
	let isReadableDir = false;
	try {
		isReadableDir = statSync(root).isDirectory();
	} catch (err) {
		throw new Error(
			`Guard #1769: scan root '${root}' does not exist or is not readable. ` +
				`The guard cannot verify the ban.`,
			{ cause: err },
		);
	}
	if (!isReadableDir) {
		throw new Error(
			`Guard #1769: scan root '${root}' is not a directory. ` +
				`The guard cannot verify the ban.`,
		);
	}

	const { files, extensions } = walk(root);

	// R6 (Hole 2): CORE_EXTENSIONS must all be in SCANNED_EXTENSIONS. This
	// makes it structurally impossible to remove a core extension (like .tsx)
	// from the scan set — the guard fails loudly naming the missing core
	// extension(s). This closes the "move .tsx to non-code" mutation: even
	// before the overlap check fires, the core-extension check blocks the
	// removal of .tsx from the scan set entirely.
	assertCoreExtensionsScanned(SCANNED_EXTENSIONS, CORE_EXTENSIONS);

	// R5 (Hole 2): NON_CODE_EXTENSIONS must not overlap SCANNED_EXTENSIONS.
	// Moving a code extension (like `.tsx`) into NON_CODE_EXTENSIONS would
	// silently disable its analysis — exactly the defect the reversal was
	// meant to prevent. This structural check makes it impossible: the guard
	// fails loudly if any extension appears in BOTH sets, naming the
	// offender. Excluding code requires a deliberate, visible gesture: the
	// extension must be REMOVED from SCANNED_EXTENSIONS first (a separate
	// conscious act), then the guard still fails because the resulting
	// unknown extension is neither scanned nor declared.
	assertNoOverlap(SCANNED_EXTENSIONS, NON_CODE_EXTENSIONS);

	// R6 (Hole 3): every NON_CODE_EXTENSIONS entry must carry a justification
	// of at least 24 characters. The previous bar (non-empty) let one-character
	// justifications like 'x' or 'todo' pass — a cosmetic bar. The repo already
	// applies this real bar elsewhere (#1736). Now the justification is a
	// structural requirement: an entry with a too-short reason fails the guard
	// loudly, naming the offending extension.
	assertAllJustified(NON_CODE_EXTENSIONS);

	// Reversed burden of proof (R4): the guard enumerates every extension it
	// saw and demands that each one be known. An unknown extension is a
	// failure that NAMES the extension — never a silent pass.
	const unknownExtensions = [...extensions].filter(
		(ext) => !SCANNED_EXTENSIONS.has(ext) && !NON_CODE_EXTENSIONS.has(ext),
	);
	if (unknownExtensions.length > 0) {
		const scanned = [...SCANNED_EXTENSIONS].sort().join(', ');
		const nonCode = [...NON_CODE_EXTENSIONS.keys()].sort().join(', ');
		throw new Error(
			`Guard #1769: found file(s) with unrecognized extension(s) ` +
				`${unknownExtensions.sort().join(', ')} in '${root}'. ` +
				`The guard cannot verify the ban on files it does not scan. ` +
				`Scanned: ${scanned}. Declared non-code: ${nonCode}. ` +
				`Add the extension to SCANNED_EXTENSIONS (if code) or ` +
				`NON_CODE_EXTENSIONS (if non-code).`,
		);
	}

	if (files.length === 0) {
		// Distinguish empty directory from directory-with-only-non-code files.
		if (extensions.size === 0) {
			throw new Error(
				`Guard #1769: scan root '${root}' is an empty directory (no entries). ` +
					`The guard cannot verify the ban without files to scan.`,
			);
		}
		throw new Error(
			`Guard #1769: scan root '${root}' contains only non-code files ` +
				`(${[...extensions].sort().join(', ')}). ` +
				`The guard cannot verify the ban without scanning code files.`,
		);
	}

	// R11 (#2033): the production scan-surface check is anchored to the merge
	// base of HEAD and `origin/develop`. The reference is read from Git, not
	// from the working tree or an authored count. A grow is silent; a shrink
	// below the reference fails loudly. Test sandboxes opt into this path only
	// when they provide an explicit Git repository.
	//
	// R7 (kept): the three mutable sets (SCANNED_EXTENSIONS,
	// NON_CODE_EXTENSIONS, EXEMPT_FILES) remain pinned in the baseline
	// so that any change to them is a visible, reviewable commit.
	// The baseline's intentionalDeletions list is checked against exact Git
	// paths before its files are removed from the reference count. This permits
	// a deliberate deletion without introducing count slack or a bypass.
	const defaultGitCwd = path.resolve(frontSrc, '../../..');
	const gitCwd =
		options.gitCwd === undefined && root !== frontSrc
			? undefined
			: path.resolve(options.gitCwd ?? defaultGitCwd);
	if (gitCwd !== undefined) {
		const scannedSubtree = normalizedGitPath(path.relative(gitCwd, root));
		if (
			scannedSubtree.length === 0 ||
			scannedSubtree === '..' ||
			scannedSubtree.startsWith('../') ||
			scannedSubtree.includes('/../')
		) {
			throw new Error(
				`Guard #1769: scan root '${root}' is outside the anchored Git ` +
					`repository '${gitCwd}'. The reference scan must use one repository ` +
					`and one concrete subtree.`,
			);
		}
		const liveCounts: Record<string, number> = {};
		for (const file of files) {
			const ext = path.extname(file).toLowerCase();
			if (ext.length > 0) {
				liveCounts[ext] = (liveCounts[ext] ?? 0) + 1;
			}
		}
		const baselinePath = path.resolve(
			options.baselinePath ??
				path.resolve(scriptDir, 'column-type-imports-baseline.json'),
		);
		const baseline = readScanBaseline(baselinePath);
		const integrationBranch = options.integrationBranch ?? 'origin/develop';
		const mergeBase = resolveMergeBase(gitCwd, integrationBranch);
		const mergeBaseFiles = listFilesAtRef(mergeBase, scannedSubtree, gitCwd);
		const integrationFiles = listFilesAtRef(
			integrationBranch,
			scannedSubtree,
			gitCwd,
		);
		if (!mergeBaseFiles.some(isScannedCodePath)) {
			throw new Error(
				`Guard #1769: Git reference '${mergeBase}' has no scanned code files ` +
					`under '${scannedSubtree}'. Refusing to treat a non-code-only ` +
					`reference as a verified no-shrink result.`,
			);
		}
		const liveFiles = files.map((file) =>
			normalizedGitPath(path.relative(gitCwd, file)),
		);
		assertIntentionalDeletions(
			mergeBaseFiles,
			liveFiles,
			baseline.intentionalDeletions,
			scannedSubtree,
			integrationFiles,
		);
		const declaredDeletions = new Set(
			baseline.intentionalDeletions.map(normalizedGitPath),
		);
		const scannedMergeBaseCounts: Record<string, number> = {};
		for (const file of mergeBaseFiles) {
			if (!isScannedCodePath(file) || declaredDeletions.has(file)) {
				continue;
			}
			const ext = path.extname(file).toLowerCase();
			if (ext.length > 0) {
				scannedMergeBaseCounts[ext] = (scannedMergeBaseCounts[ext] ?? 0) + 1;
			}
		}
		assertNoShrinkVsMergeBase(liveCounts, scannedMergeBaseCounts);
		assertScannedExtensionsPinned(SCANNED_EXTENSIONS, baseline);
		assertNonCodeExtensionsPinned(NON_CODE_EXTENSIONS, baseline);
		assertExemptionsPinned(EXEMPT_FILES, baseline);

		// R8: assert on the REAL tree that isExempt returns true ONLY for
		// files listed in EXEMPT_FILES. A hardcoded `||` clause in isExempt
		// (the r6/r7 bypass) would exempt a real file not in EXEMPT_FILES.
		// This assertion walks the actual scanned tree and fails if any
		// exempted file in SCANNED_EXTENSIONS is not in the pinned set —
		// making the guard itself red on the bypass, not just the test suite.
		//
		// R9 (#1851): the previous version only walked `.ts`/`.tsx`. A bypass
		// on a `.mts`/`.cts`/`.ctsx`/`.mjs`/`.cjs` file (all in
		// SCANNED_EXTENSIONS) was invisible to the assertion. The fix iterates
		// every scanned extension so the assertion's perimeter matches the
		// guard's scan perimeter.
		const normalizedExemptions = [...EXEMPT_FILES].map((e) =>
			e.split(path.sep).join('/'),
		);
		const illicitExemptions: string[] = [];
		for (const file of files) {
			const ext = path.extname(file).toLowerCase();
			// Match the guard's scan surface exactly: extensionless files are
			// scanned (fail-closed), and every SCANNED_EXTENSIONS extension
			// is scanned. Skip only files with a non-code extension — those
			// were never scanned by walk() in the first place.
			const isScanned = ext.length === 0 || SCANNED_EXTENSIONS.has(ext);
			if (!isScanned) {
				continue;
			}
			const normalized = path.relative(root, file).split(path.sep).join('/');
			if (isExempt(normalized)) {
				const isPinned =
					normalizedExemptions.includes(normalized) ||
					normalizedExemptions.some((e) => normalized.endsWith('/' + e));
				if (!isPinned) {
					illicitExemptions.push(normalized);
				}
			}
		}
		if (illicitExemptions.length > 0) {
			throw new Error(
				`Guard #1769: isExempt returned true for ${illicitExemptions.length} ` +
					`file(s) not in the pinned EXEMPT_FILES set — ` +
					`illicit exemption(s): ${illicitExemptions.sort().join(', ')}. ` +
					`isExempt must derive from EXEMPT_FILES; a hardcoded bypass ` +
					`would exempt files without modifying the pinned set.`,
			);
		}
	}

	const findings: Finding[] = [];
	for (const file of files) {
		const relativePath = path.relative(root, file);
		// Normalize to forward slashes for consistent comparison.
		const normalizedPath = relativePath.split(path.sep).join('/');
		// Exemption check: match by suffix so test sandboxes (which live
		// under scripts/guards/) still resolve to the exempt files.
		if (isExempt(normalizedPath)) {
			continue;
		}
		const source = readFileSync(file, 'utf8');
		findings.push(...scanSourceFile(normalizedPath, source));
	}
	return findings;
};

export const main = (root: string = frontSrc): void => {
	const findings = scanFrontSrcForBannedImports(root);
	// Count files by walking the same root the scan uses, so the reported
	// number matches what was actually scanned (not a static constant).
	const { files } = walk(root);
	const fileCount = files.length;
	if (findings.length > 0) {
		console.error(
			`ColumnDef/Row/TanStackTable import violation (#1769): ` +
				`${findings.length} banned import(s) found across ${fileCount} file(s). ` +
				`Import from '${REPLACEMENT}' instead.`,
		);
		for (const f of findings) {
			console.error(`  ${formatFinding(f)}`);
		}
		process.exit(1);
	}
	console.log(
		`No banned @tanstack/react-table imports found (${fileCount} files scanned) [OK]`,
	);
};

// Only run when invoked directly (node scripts/guards/x.mts), not when imported
// by the test file.
const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
