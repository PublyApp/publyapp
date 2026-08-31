// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';

/**
 * Selection-reconciliation guard (#1603).
 *
 * The canonical rule (docs/guides/list-pages-search-filter-cursor-pagination.md
 * §7.0 criterion 1): every selectable server-side list table that can lose
 * or move rows after a mutation must reconcile its selection to the visible
 * rows — either by adopting `useTableRowSelection({ rows,
 * reconcileVisibleRows: true })` or by carrying a documented reason not to.
 *
 * The codebase's implementation of that contract is the `useRowSelection`
 * hook (`apps/front/src/components/table/use-row-selection.ts`): it owns
 * the `RowSelectionMap` state and runs a `useEffect` that prunes the map
 * to the visible row ids on every `visibleKey` change. So a list-table
 * component that owns its own `useState<RowSelectionMap>({})` (or its
 * `Record<string, boolean>` shape twin) — instead of calling
 * `useRowSelection` — is a regression: the prune effect is missing, and
 * a row that leaves the view (status change, filter, page churn) will
 * linger in the selection until the user notices.
 *
 * Property asserted on the REAL tree:
 *
 *   1. Any source file under `apps/front/src/routes/` (the route layer,
 *      where list-table components live) that exhibits the "list-table
 *      selection site" signature (imports `useRowSelection` OR has
 *      `selection.rowSelection[...]` access) MUST NOT also declare its
 *      own `useState<RowSelectionMap>(...)` or
 *      `useState<Record<string, boolean>>(...)` — the prune effect lives
 *      in the hook, and a shadow state skips it.
 *
 *   2. The hook itself (`use-row-selection.ts`) is excluded by the
 *      selection-site signature filter (it has no `selection.rowSelection`
 *      access and is not in `routes/`). Test files (`.test.ts`/`.test.tsx`)
 *      are excluded by the production-source filter — a literal
 *      `useState<RowSelectionMap>` in a test is a fixture, not a real
 *      component.
 *
 * The guard catches the regression at PR time, naming the file and the
 * offending line, so a future refactor that bypasses the hook is visible
 * before it lands.
 *
 * Pairs with `use-row-selection-bulk-target-guard.test.ts` (#1604):
 * #1603 is the OWN side (selection source), #1604 is the USE side (how
 * ids are derived from that selection).
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const FRONT_ROOT = join(here, '..', '..', '..');
const ROUTES_ROOT = join(FRONT_ROOT, 'src', 'routes');

const isProductionSource = (file: string): boolean =>
	(file.endsWith('.ts') || file.endsWith('.tsx')) &&
	!file.endsWith('.test.ts') &&
	!file.endsWith('.test.tsx');

const walkDir = (dir: string, out: string[] = []): string[] => {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		let st;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			walkDir(full, out);
		} else if (st.isFile() && isProductionSource(full)) {
			out.push(full);
		}
	}
	return out;
};

// "List-table selection site" signature: a file that is a consumer of the
// selection primitive. Either it imports `useRowSelection` directly, or it
// reads `selection.rowSelection[...]` to drive its rendering. Both shapes
// mean the file is in the bulk-action / list-table family and must not
// own its own shadow selection state.
const SELECTION_SITE_RE =
	/\buseRowSelection\s*[(,]|selection\.rowSelection\s*\[|rowSelection\s*\[/;

// Hand-rolled selection state. Two forbidden patterns:
//   (a) `useState<RowSelectionMap>(...)` — directly shadows the type.
//   (b) `useState<Record<string, boolean>>(...)` — the loose twin of the
//       same shape, used when a developer didn't bother importing the
//       canonical type.

/**
 * AST-based detector (#1943 follow-up, round 2 hardening).
 *
 * HOW IT ACTUALLY WORKS (this comment is the contract — see the verdict-r1
 * finding "compares NAMES, not symbols"):
 *
 * The detector is SYNTACTIC and file-local. It does NOT run the TypeScript
 * type checker, so it cannot follow a type across modules. What it resolves
 * within the ONE source file it scans:
 *
 *   - the canonical name itself: any `useState<RowSelectionMap>`-style
 *     TypeReference is caught, whether or not the file imports the type;
 *   - in-file IMPORT aliases: `import type { RowSelectionMap as RM }` binds
 *     the LOCAL name `RM` to the canonical type, so `useState<RM>` is
 *     caught. A different type re-exported under the canonical name from
 *     some exotic module would fool the detector — it has no type
 *     information — but the canonical import spells RowSelectionMap;
 *   - in-file TYPE aliases: `type SM = Record<string, boolean>` (or
 *     `type SM = RowSelectionMap | undefined`, chained aliases included)
 *     is resolved recursively, so `useState<SM>` is caught;
 *   - the Record shape: `Record<string, boolean>`, and the round-2
 *     variants `Record<string, boolean | undefined>` (the raw map's value
 *     type under noUncheckedIndexedAccess) and `Record<string, true>`
 *     (the set-twin). The value slot is boolean-ish when it is ONLY
 *     `boolean` keyword, `true`/`false` literal keywords, `undefined`,
 *     `null`, or a union made exclusively of those — `Record<string,
 *     string | boolean>` is NOT the selection-map shape and stays clean;
 *   - the indexed literal `{ [id: string]: boolean }`.
 *
 * Everything else is not a shadow selection state. In particular a shadow
 * type that is neither spelled RowSelectionMap in this file nor reachable
 * through an in-file alias is OUTSIDE the detector's surface — that is the
 * price of staying a fast, dependency-free structural check instead of
 * shelling out to a full TypeScript program.
 */
type ReconCtx = {
	/** Local type names bound, in this file, to the canonical RowSelectionMap. */
	canonicalNames: Set<string>;
	/** Local type alias name -> its RHS type node. */
	typeAliases: Map<string, ts.TypeNode>;
	/** Resolved shape verdict per alias name ('shadow' | 'other'). */
	aliasVerdict: Map<string, 'shadow' | 'other'>;
	/** Aliases currently being resolved (cycle guard). */
	resolving: Set<string>;
};

/** True when the value slot of a Record/indexed-map is boolean-ish only. */
const isBooleanishType = (n: ts.Node): boolean => {
	// `true` / `false` in type position are LiteralTypeNode wrappers around
	// the keyword token — unwrap before inspecting the kind.
	if (ts.isLiteralTypeNode(n)) {
		return (
			n.literal.kind === ts.SyntaxKind.TrueKeyword ||
			n.literal.kind === ts.SyntaxKind.FalseKeyword
		);
	}
	if (
		n.kind === ts.SyntaxKind.BooleanKeyword ||
		n.kind === ts.SyntaxKind.UndefinedKeyword ||
		n.kind === ts.SyntaxKind.NullKeyword
	) {
		return true;
	}
	if (ts.isUnionTypeNode(n)) {
		return n.types.every((part) => isBooleanishType(part));
	}
	return false;
};

const isRecordStringBooleanishRef = (n: ts.Node): boolean => {
	if (!ts.isTypeReferenceNode(n) || !ts.isIdentifier(n.typeName)) {
		return false;
	}
	if (
		n.typeName.text !== 'Record' ||
		!n.typeArguments ||
		n.typeArguments.length !== 2
	) {
		return false;
	}
	const key = n.typeArguments[0];
	const val = n.typeArguments[1];
	if (!key || !val) {
		return false;
	}
	// `string` / `boolean` are KeywordTypeNodes (StringKeyword / BooleanKeyword)
	// in this TypeScript version, not TypeReferenceNodes — check by kind.
	return key.kind === ts.SyntaxKind.StringKeyword && isBooleanishType(val);
};

const isIndexedStringBooleanishType = (n: ts.Node): boolean => {
	// `{ [id: string]: boolean }` — TypeLiteralNode with a single
	// IndexSignatureDeclaration whose key type is `string` and value type is
	// boolean-ish. Any other signature (a regular property, a different value
	// type) is not a forbidden shadow state.
	if (!ts.isTypeLiteralNode(n) || n.members.length !== 1) {
		return false;
	}
	const m = n.members[0];
	if (!m || !ts.isIndexSignatureDeclaration(m)) {
		return false;
	}
	const keyType = m.parameters[0]?.type;
	const valType = m.type;
	if (!keyType || !valType) {
		return false;
	}
	return (
		keyType.kind === ts.SyntaxKind.StringKeyword && isBooleanishType(valType)
	);
};

/** Resolves a type node to a verdict: is it the shadow selection state? */
const typeNodeIsShadowSelectionState = (n: ts.Node, cx: ReconCtx): boolean => {
	// `RowSelectionMap` / `NS.RowSelectionMap` — the canonical name.
	if (ts.isTypeReferenceNode(n)) {
		if (ts.isIdentifier(n.typeName)) {
			const name = n.typeName.text;
			if (name === 'RowSelectionMap') {
				return true;
			}
			// Local type alias: resolve recursively.
			if (cx.typeAliases.has(name)) {
				if (cx.aliasVerdict.has(name)) {
					return cx.aliasVerdict.get(name) === 'shadow';
				}
				if (cx.resolving.has(name)) {
					// Cyclic alias (`type A = B; type B = A`) — not a shadow.
					return false;
				}
				cx.resolving.add(name);
				const rhs = cx.typeAliases.get(name)!;
				const verdict = typeNodeIsShadowSelectionState(rhs, cx)
					? 'shadow'
					: 'other';
				cx.resolving.delete(name);
				cx.aliasVerdict.set(name, verdict);
				return verdict === 'shadow';
			}
			// In-file import binding: `import { RowSelectionMap as RM }`.
			if (cx.canonicalNames.has(name)) {
				return true;
			}
		} else if (ts.isQualifiedName(n.typeName)) {
			if (n.typeName.right.text === 'RowSelectionMap') {
				return true;
			}
		}
	}
	if (isRecordStringBooleanishRef(n) || isIndexedStringBooleanishType(n)) {
		return true;
	}
	// Union types: a canonical shape on one side is a shadow state even when
	// the other side is an optionality modifier (`RowSelectionMap | undefined`,
	// `Record<string, boolean> | null`).
	if (ts.isUnionTypeNode(n)) {
		for (const part of n.types) {
			if (typeNodeIsShadowSelectionState(part, cx)) {
				return true;
			}
		}
	}
	if (ts.isParenthesizedTypeNode(n)) {
		return typeNodeIsShadowSelectionState(n.type, cx);
	}
	return false;
};

/**
 * Collects the in-file type bindings the syntactic resolver can follow:
 * named imports that spell `RowSelectionMap` and local `type` aliases.
 * Both the alias's RHS is resolved lazily (see the cycle guard above).
 */
const collectReconBindings = (sourceFile: ts.SourceFile): ReconCtx => {
	const cx: ReconCtx = {
		canonicalNames: new Set<string>(),
		typeAliases: new Map<string, ts.TypeNode>(),
		aliasVerdict: new Map<string, 'shadow' | 'other'>(),
		resolving: new Set<string>(),
	};
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node)) {
			const clause = node.importClause;
			const named = clause?.namedBindings;
			if (named && ts.isNamedImports(named)) {
				for (const element of named.elements) {
					// The exported name is the canonical one: either
					// `import { RowSelectionMap }` or
					// `import { RowSelectionMap as RM }`.
					const exported = element.propertyName ?? element.name;
					if (exported.text === 'RowSelectionMap') {
						cx.canonicalNames.add(element.name.text);
					}
				}
			}
		}
		if (ts.isTypeAliasDeclaration(node)) {
			cx.typeAliases.set(node.name.text, node.type);
		}
		node.forEachChild(visit);
	};
	visit(sourceFile);
	return cx;
};

const findShadowUseStateCalls = (
	source: string,
	filePath: string,
): string[] => {
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const cx = collectReconBindings(sourceFile);
	const offenders: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			if (ts.isIdentifier(expr) && expr.text === 'useState') {
				const targs = node.typeArguments;
				if (targs && targs.length > 0) {
					const t = targs[0];
					if (t && typeNodeIsShadowSelectionState(t, cx)) {
						const { line } = sourceFile.getLineAndCharacterOfPosition(
							node.getStart(sourceFile),
						);
						offenders.push(`line ${line + 1}: ${node.getText()}`);
					}
				}
			}
		}
		node.forEachChild(visit);
	};
	visit(sourceFile);
	return offenders;
};

const findViolations = (file: string): string[] => {
	const source = readFileSync(file, 'utf8');
	if (!SELECTION_SITE_RE.test(source)) {
		// Not a list-table selection site — out of scope for this guard.
		return [];
	}
	// AST detector covers the canonical case AND the three #1943 follow-up
	// shapes (union with `| undefined` / `| null`, indexed type literal).
	return findShadowUseStateCalls(source, file);
};

const allRouteFiles = walkDir(ROUTES_ROOT);

describe('list-table components own selection via useRowSelection (#1603)', () => {
	test('at least one route file is a selection site (drift detector)', () => {
		// Anti-vacuous: at least one route file must exhibit the
		// selection-site signature today. If this ever returns 0, the
		// rule no longer applies and the guard should be retired — not
		// silently kept.
		const sites = allRouteFiles.filter((file) =>
			SELECTION_SITE_RE.test(readFileSync(file, 'utf8')),
		);
		expect(
			sites.length,
			'expected at least one route file to be a list-table selection ' +
				'site. If the codebase has moved off useRowSelection entirely, ' +
				'retire this guard rather than letting it pass vacuously.',
		).toBeGreaterThan(0);
	});

	test('no list-table selection site hand-rolls a RowSelectionMap via useState', () => {
		const offenders: Array<{ file: string; lines: string[] }> = [];
		for (const file of allRouteFiles) {
			const lines = findViolations(file);
			if (lines.length > 0) {
				offenders.push({
					file: relative(FRONT_ROOT, file).split(sep).join('/'),
					lines,
				});
			}
		}

		expect(
			offenders,
			'List-table selection sites must source their selection from ' +
				'`useRowSelection(visibleRowIds)` (the hook that prunes the ' +
				'map to visible ids on every data change). A hand-rolled ' +
				'`useState<RowSelectionMap>({})` or `useState<Record<string, ' +
				'boolean>>({})` skips the prune effect, so a row that leaves ' +
				'the view will linger in the selection. Offenders: ' +
				JSON.stringify(offenders, null, 2),
		).toEqual([]);
	});

	test('REPLAY — fabricating a hand-rolled useState<RowSelectionMap> in a selection site is caught', () => {
		// Fabricated source: a list-table component that already uses
		// useRowSelection (qualifying as a selection site) but ALSO adds
		// a hand-rolled shadow state. The detector must flag it.
		const fabricated = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';

export const MyList = ({ rows }: { rows: { id: string }[] }) => {
	const selection = useRowSelection(rows.map((r) => r.id));
	// Regression: a shadow state that bypasses the hook's prune effect.
	const [shadow, setShadow] = useState<RowSelectionMap>({});
	return null;
};
`;
		const violations = findViolationsAgainstSource(fabricated);
		expect(
			violations.length,
			'the detector must catch the hand-rolled useState<RowSelectionMap> ' +
				'in the fabricated source — that is the regression this guard pins',
		).toBeGreaterThan(0);

		// Removing the shadow clears the violation — proves the detector
		// isn't a blanket block on useState.
		const clean = `
import { useRowSelection } from '~/components/table/use-row-selection';

export const MyList = ({ rows }: { rows: { id: string }[] }) => {
	const selection = useRowSelection(rows.map((r) => r.id));
	return null;
};
`;
		expect(findViolationsAgainstSource(clean)).toEqual([]);

		// And a file that is NOT a selection site (no useRowSelection, no
		// selection.rowSelection access) is allowed to own its own
		// useState<Record<string, boolean>> — the guard does not paint
		// the whole tree with a single brush.
		const nonSite = `
import { useState } from 'react';

export const MyWidget = () => {
	const [flags, setFlags] = useState<Record<string, boolean>>({});
	return null;
};
`;
		expect(findViolationsAgainstSource(nonSite)).toEqual([]);

		// --- #1943 follow-up: three shapes the regex misses ---
		// The regex required the type parameter to be exactly the canonical
		// name (no `| undefined` / `| null` suffix, no indexed type alias).
		// The AST detector below accepts these by SHAPE (keyword kinds, type
		// literal members), not by exact name text.
		const unionUndefined = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
export const A = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<RowSelectionMap | undefined>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(unionUndefined).length,
			'#1943 follow-up: useState<RowSelectionMap | undefined> must be caught',
		).toBeGreaterThan(0);

		const unionNull = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
export const B = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<Record<string, boolean> | null>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(unionNull).length,
			'#1943 follow-up: useState<Record<string, boolean> | null> must be caught',
		).toBeGreaterThan(0);

		const indexedMap = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
export const C = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<{ [id: string]: boolean }>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(indexedMap).length,
			'#1943 follow-up: useState<{ [id: string]: boolean }> must be caught',
		).toBeGreaterThan(0);

		// --- round 2 / verdict-r1: the detector resolved NAMES, not symbols ---
		// The four forms below stayed green. They are caught by resolving the
		// in-file bindings (import rename, local type alias) and the Record
		// value-shape variants (union-undefined, literal-true). This is still
		// a syntactic, file-local resolution — a shadow type spelled under a
		// different name that neither imports nor aliases RowSelectionMap in
		// this file remains outside the surface (see the comment on the
		// detector itself).
		const renamedImport = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
import type { RowSelectionMap as RM } from '~/components/table/use-row-selection';
export const D = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<RM>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(renamedImport).length,
			'round 2: useState<RM> after `import { RowSelectionMap as RM }` must be caught',
		).toBeGreaterThan(0);

		const localTypeAlias = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
type SM = Record<string, boolean>;
export const E = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<SM>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(localTypeAlias).length,
			'round 2: useState<SM> after `type SM = Record<string, boolean>` must be caught',
		).toBeGreaterThan(0);

		const recordUnionUndefined = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
export const F = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<Record<string, boolean | undefined>>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(recordUnionUndefined).length,
			'round 2: useState<Record<string, boolean | undefined>> must be caught',
		).toBeGreaterThan(0);

		const recordLiteralTrue = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
export const G = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<Record<string, true>>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(recordLiteralTrue).length,
			'round 2: useState<Record<string, true>> must be caught',
		).toBeGreaterThan(0);

		// And the widened detector must NOT paint the whole tree with a
		// single brush: a shadow state that is a different shape stays clean.
		const mixedValueRecord = `
import { useState } from 'react';
import { useRowSelection } from '~/components/table/use-row-selection';
export const H = () => {
	const sel = useRowSelection([]);
	const [s, setS] = useState<Record<string, string | boolean>>({});
	return null;
};
`;
		expect(
			findViolationsAgainstSource(mixedValueRecord).length,
			'round 2: Record<string, string | boolean> is NOT the selection-map shape and must stay clean',
		).toBe(0);
	});
});

/**
 * Run the violation detector against an in-memory source string.
 * Exported for the fabrication test above and for any future paired
 * proof. Mirrors `findViolations` in logic but skips the file lookup
 * and the production-source filter.
 */
export const findViolationsAgainstSource = (source: string): string[] => {
	if (!SELECTION_SITE_RE.test(source)) {
		return [];
	}
	return findShadowUseStateCalls(source, '<fabricated>');
};
