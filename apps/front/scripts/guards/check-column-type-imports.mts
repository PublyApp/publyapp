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
 *     the specifier is the root and the brief requires it).
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
 * Run: `node scripts/guards/check-column-type-imports.mts`
 * Tests: `node --test scripts/guards/check-column-type-imports.test.mts`
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
 * Determines whether `normalizedPath` (relative to the scanned root) refers
 * to an exempt file. The scanned root may be `apps/front/src` (production)
 * or a test sandbox under `scripts/guards/`. In production the path is
 * `components/table/column-type.ts`; in tests it may include the full
 * `apps/front/src/...` prefix or be relative to a scripts/guards/ root.
 *
 * Only `column-type.ts` is exempt — it is the passthrough itself. The brief
 * asked to verify whether `data-table.tsx` needs an exemption; it does not
 * import from `@tanstack/react-table` (checked against the current tree), so
 * it is not listed here.
 */
const isExempt = (normalizedPath: string): boolean => {
	const suffix = 'components/table/column-type.ts';
	return normalizedPath === suffix || normalizedPath.endsWith('/' + suffix);
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
	/** The raw AST node text of the triggering import statement. */
	nodeText: string;
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
const bannedBindingsFromImport = (
	node: ts.ImportDeclaration,
): string[] => {
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

	// Namespace import: `import * as ColumnDef from '...'`
	if (namedBindings !== undefined && ts.isNamespaceImport(namedBindings)) {
		if (BANNED_TYPE_NAMES.has(namedBindings.name.text)) {
			found.push(namedBindings.name.text);
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
				if (
					isLegacy ||
					bindings.length > 0 ||
					node.importClause === undefined
				) {
					findings.push({
						file: relativePath,
						line: lineOf(sourceFile, node),
						specifier,
						bindings: isLegacy
							? bindings.length > 0
								? bindings
								: ['(legacy specifier)']
							: bindings,
						nodeText: node
							.getText(sourceFile)
							.trim()
							.replace(/\s+/g, ' '),
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
				const exportedNames: string[] = [];
				if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
					for (const element of node.exportClause.elements) {
						const exportedName = element.propertyName ?? element.name;
						if (BANNED_TYPE_NAMES.has(exportedName.text)) {
							exportedNames.push(element.name.text);
						}
					}
				}
				if (
					isLegacy ||
					exportedNames.length > 0
				) {
					findings.push({
						file: relativePath,
						line: lineOf(sourceFile, node),
						specifier,
						bindings: isLegacy
							? exportedNames.length > 0
								? exportedNames
								: ['(legacy re-export)']
							: exportedNames,
						nodeText: node
							.getText(sourceFile)
							.trim()
							.replace(/\s+/g, ' '),
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
						nodeText: node
							.getText(sourceFile)
							.trim()
							.replace(/\s+/g, ' '),
					});
				}
			}
		}

		node.forEachChild(visit);
	};

	visit(sourceFile);

	return findings;
};

/** Recursively walks `dir` and returns every .ts/.tsx/.mts file. */
const walk = (dir: string): string[] => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry === 'node_modules' || entry === '.cache' || entry === '.turbo') {
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

/**
 * Scans the front source tree for banned imports.
 * @param root Override the root directory (used by tests).
 */
export const scanFrontSrcForBannedImports = (
	root: string = frontSrc,
): Finding[] => {
	const findings: Finding[] = [];
	for (const file of walk(root)) {
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
	if (findings.length > 0) {
		console.error(
			`ColumnDef/Row/TanStackTable import violation (#1769): ` +
				`${findings.length} banned import(s) found. ` +
				`Import from '${REPLACEMENT}' instead.`,
		);
		for (const f of findings) {
			console.error(`  ${formatFinding(f)}`);
		}
		process.exit(1);
	}
	console.log(
		'No banned @tanstack/react-table imports found (apps/front/src) [OK]',
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
