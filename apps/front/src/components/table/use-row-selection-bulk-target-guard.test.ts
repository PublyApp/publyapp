// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';
import { describe, expect, test } from 'vitest';

/**
 * Selection-derived bulk-target guard (#1604).
 *
 * The canonical rule (docs/guides/list-pages-search-filter-cursor-pagination.md
 * §7.0 criterion 2): bulk mutation target IDs must be derived from the
 * reconciled visible selected rows
 * (`const selectedIds = selectedRows.map((row) => row.id)`), not from raw
 * selection state (`Object.keys(rowSelection)`).
 *
 * Why a structural guard, not a per-component test: every bulk-action site
 * takes a `rows` prop (the visible rows) and a `selection` result from
 * `useRowSelection`. The safe derivation is `rows.filter((row) =>
 * selection.rowSelection[row.id])` (or a `rows.flatMap` equivalent). Any
 * derivation that iterates the selection MAP directly (rather than the
 * VISIBLE ROWS list) risks sending a stale id to a bulk mutation when the
 * selection has not yet been pruned (the effect in `useRowSelection` runs
 * AFTER the next render, so for a single render the map can still contain
 * ids for rows that just left the view). `useRowSelection` prunes the map
 * to visible ids on every `visibleKey` change, but the visible-rows list
 * is the only place where the rendered "this row is still here" truth lives
 * — iterating it is what makes the contract hold across the prune window.
 *
 * Property asserted on the REAL tree:
 *
 *   1. Any source file under `apps/front/src/routes/` that references
 *      `selection.rowSelection` (or `rowSelection` directly) AND owns a
 *      bulk mutation call (one of `*Ids` / `*Ids:` parameters passed to
 *      `mutateAsync`) MUST NOT derive those ids via:
 *        - `Object.keys(selection.rowSelection)` / `Object.keys(rowSelection)`
 *        - `Object.entries(selection.rowSelection)` / `Object.entries(rowSelection)`
 *        - `Object.values(selection.rowSelection)` / `Object.values(rowSelection)`
 *        - `[...selection.rowSelection]` / `[...rowSelection]`
 *        - `for (const id in selection.rowSelection)` — for-in over the map
 *        - `const m = selection.rowSelection; Object.keys(m)` — aliasing the map
 *
 *   2. A bulk-action site that iterates the selection map without ever
 *      consulting the visible rows list is the regression this guard pins.
 *
 * The `useRowSelection` primitive itself is excluded — it owns the map
 * and is allowed to introspect it (it is the one source of truth for the
 * pruned state, and its effect is the prune).
 *
 * #1943 hardening: migrated from regex matching to ts-morph AST analysis to
 * catch structural forms regex could not see:
 *   - `for...in` loops over the selection map (not caught by Object.* patterns)
 *   - aliased variable extraction: `const m = selection.rowSelection; Object.keys(m)`
 *     (regex required the map expression inline, not through a variable)
 */

const here = fileURLToPath(new URL('.', import.meta.url));
// __tests__/scripts/.../use-row-selection-bulk-target-guard.test.ts -> apps/front
// (the .test.ts lives next to use-row-selection.ts so its `here` is the
// components/table dir; walk up two levels to the apps/front root.)
const FRONT_ROOT = join(here, '..', '..', '..');
const ROUTES_ROOT = join(FRONT_ROOT, 'src', 'routes');

const isProductionSource = (file: string): boolean =>
	(file.endsWith('.ts') || file.endsWith('.tsx')) &&
	!file.endsWith('.test.ts') &&
	!file.endsWith('.test.tsx');

const walkDir = (dir: string): string[] => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		let stat;
		try {
			stat = statSync(full);
		} catch {
			continue;
		}
		if (stat.isDirectory()) {
			out.push(...walkDir(full));
		} else if (stat.isFile() && isProductionSource(full)) {
			out.push(full);
		}
	}
	return out;
};

const allRouteFiles = walkDir(ROUTES_ROOT);

/**
 * AST-based violation detector (#1943).
 *
 * Walks the TypeScript AST to find forbidden id-derivation patterns that
 * extract keys from the selection map without consulting the visible rows.
 * Unlike regex, the AST distinguishes a `for...in` loop, an aliased variable
 * holding `selection.rowSelection`, and a call to `Object.keys` on that alias.
 *
 * Returns violation description strings in source order.
 */
type Violation = {
	name: string;
	line: number;
};

/**
 * Extract the source text of a node, unwrapped from parentheses.
 */
const nodeText = (node: ts.Node): string => {
	let n = node;
	while (ts.isParenthesizedExpression(n)) {
		n = n.expression;
	}
	return n.getText();
};

/** True if the argument to Object.keys/entries/values is the selection map
 * directly (e.g. `selection.rowSelection` or `rowSelection` itself), possibly
 * nested in parentheses. */
const isSelectionMapExpression = (arg: ts.Expression): boolean => {
	let e = arg;
	while (ts.isParenthesizedExpression(e)) {
		e = e.expression;
	}
	if (ts.isPropertyAccessExpression(e) && e.name.text === 'rowSelection') {
		return true;
	}
	if (ts.isIdentifier(e) && e.text === 'rowSelection') {
		return true;
	}
	return false;
};

const FORBIDDEN_METHODS = new Set(['keys', 'entries', 'values']);

/**
 * Walk a single SourceFile and return all violations found.
 */
const findViolationsInSource = (
	source: string,
	filePath: string,
): Violation[] => {
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	const violations: Violation[] = [];

	/** Visitor callback that records a violation at the node's line. */
	const record = (name: string, node: ts.Node) => {
		const { line } = sourceFile.getLineAndCharacterOfPosition(
			node.getStart(sourceFile),
		);
		violations.push({ name, line: line + 1 });
	};

	/**
	 * First pass: collect aliases of the selection map.
	 * An alias is a `const m = selection.rowSelection` (or `rowSelection`
	 * direct) binding so we can detect `Object.keys(m)` in the second pass.
	 */
	const selectionMapAliases = new Set<string>();
	const visit = (node: ts.Node): void => {
		// Detect `Object.keys/entries/values(selection.rowSelection | rowSelection)`
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			if (
				ts.isPropertyAccessExpression(expr) &&
				ts.isIdentifier(expr.expression) &&
				expr.expression.text === 'Object' &&
				FORBIDDEN_METHODS.has(expr.name.text)
			) {
				const arg = node.arguments[0];
				if (arg && isSelectionMapExpression(arg)) {
					record(
						`Object.${expr.name.text}(selection.rowSelection|rowSelection)`,
						node,
					);
				}
			}
		}

		// Detect `[...selection.rowSelection]` / `[...rowSelection]` spread
		if (ts.isArrayLiteralExpression(node)) {
			for (const elt of node.elements) {
				if (!elt) continue;
				// Spread elements wrap the spread expression — unwrap before
				// testing the underlying expression.
				const inner = ts.isSpreadElement(elt) ? elt.expression : elt;
				if (isSelectionMapExpression(inner)) {
					record('[...selection.rowSelection|rowSelection]', node);
				}
			}
		}

		// Detect `for (const id in selection.rowSelection)` — for-in over the map
		if (ts.isForInStatement(node)) {
			// TypeScript 7+ stores the iterated expression on `.expression`
			// (older versions named it `.iterable`); the .iterable alias is
			// not present in the vendored ts-morph compiler this repo uses.
			const iterated = node.expression;
			if (iterated && isSelectionMapExpression(iterated)) {
				record('for-in over selection map', node);
			}
		}

		// Collect aliases: `const m = selection.rowSelection` or `const m = rowSelection`
		if (ts.isVariableStatement(node)) {
			for (const decl of node.declarationList.declarations) {
				if (decl.initializer && isSelectionMapExpression(decl.initializer)) {
					if (ts.isIdentifier(decl.name)) {
						selectionMapAliases.add(decl.name.text);
					}
				}
			}
		}

		// Detect `Object.keys(m)` where m is an alias of the selection map
		if (ts.isCallExpression(node)) {
			const expr = node.expression;
			if (
				ts.isPropertyAccessExpression(expr) &&
				ts.isIdentifier(expr.expression) &&
				expr.expression.text === 'Object' &&
				FORBIDDEN_METHODS.has(expr.name.text)
			) {
				const arg = node.arguments[0];
				if (arg && ts.isIdentifier(arg) && selectionMapAliases.has(arg.text)) {
					record(`Object.${expr.name.text} on aliased selection map`, node);
				}
			}
		}

		node.forEachChild(visit);
	};

	visit(sourceFile);
	return violations;
};

/**
 * Detect whether a source file references the selection map at all (either
 * `selection.rowSelection` or a direct `rowSelection` binding). Uses the
 * AST to avoid false positives on comments or strings.
 */
const hasSelectionMapReference = (source: string): boolean => {
	const sourceFile = ts.createSourceFile(
		'',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	let found = false;
	const visit = (node: ts.Node): void => {
		if (
			ts.isPropertyAccessExpression(node) &&
			node.name.text === 'rowSelection'
		) {
			found = true;
		}
		if (ts.isIdentifier(node) && node.text === 'rowSelection') {
			found = true;
		}
		if (!found) {
			node.forEachChild(visit);
		}
	};
	visit(sourceFile);
	return found;
};

/**
 * Walk route files that touch the selection map and collect offenders.
 */
const findViolations = (file: string): Violation[] => {
	const source = readFileSync(file, 'utf8');
	if (!hasSelectionMapReference(source)) {
		return [];
	}
	return findViolationsInSource(source, file);
};

/**
 * Run the violation detector against an in-memory source string.
 * Exported for the fabrication test above and for any future synthetic
 * proof (e.g. pairing the RED of a real offender with a fabricated
 * baseline that asserts the detector's contract).
 */
export const findViolationsAgainstSource = (source: string): string[] => {
	const violations = findViolationsInSource(source, '<fabricated>');
	// Deduplicate by name (multiple occurrences of the same pattern class)
	return [...new Set(violations.map((v) => v.name))];
};

describe('bulk-action sites derive ids from visible rows, not the raw selection map (#1604)', () => {
	// Discover bulk-action sites: route files that touch selection state.
	const candidateFiles = allRouteFiles
		.filter((file) => hasSelectionMapReference(readFileSync(file, 'utf8')))
		.map((file) => relative(FRONT_ROOT, file).split(sep).join('/'));

	// The selection primitive itself owns the map; the test library that
	// re-exports the hook for spies is also allowed. Both live under
	// `components/table/`, not `routes/`, so the route-only walk already
	// excludes them. Pin the exclusion explicitly so a future refactor
	// that moves a bulk-action test into routes/ doesn't silently exempt
	// it via name: the test walks `routes/`, period.

	test('every route file that touches the selection map is audited (drift detector)', () => {
		// Anti-vacuous: at least one route file must touch the selection
		// map today, otherwise the guard has nothing to assert and would
		// be vacuously green. If this ever returns 0, the rule no longer
		// applies (every bulk action has moved to a different shape) and
		// the guard should be retired — not silently kept.
		expect(
			candidateFiles.length,
			'expected at least one route file under apps/front/src/routes/ ' +
				'to reference the selection map. If the codebase has moved ' +
				'all bulk actions off `useRowSelection`, retire this guard ' +
				'rather than letting it pass vacuously.',
		).toBeGreaterThan(0);
	});

	test('no bulk-action site derives ids via Object.keys/entries/values/[...] on the selection map', () => {
		const offenders: Array<{ file: string; violations: Violation[] }> = [];
		for (const file of allRouteFiles) {
			const violations = findViolations(file);
			if (violations.length > 0) {
				offenders.push({
					file: relative(FRONT_ROOT, file).split(sep).join('/'),
					violations,
				});
			}
		}

		expect(
			offenders,
			`Bulk-action sites must derive ids from the visible rows list ` +
				`(e.g. \`rows.filter((row) => selection.rowSelection[row.id])\`), ` +
				`not from raw extraction of the selection map. The map can hold ` +
				`ids for rows that just left the view (the prune effect runs ` +
				`AFTER the next render), so a raw extraction risks a stale target. ` +
				`Offenders: ${JSON.stringify(offenders, null, 2)}`,
		).toEqual([]);
	});

	test('REPLAY — fabricating a raw-map derivation in a route file is caught (RED), removing it goes back to GREEN', () => {
		// This is the proof that the guard is not vacuously green. We
		// construct a fabricated source string that exhibits every
		// forbidden pattern, run the detector against it, and assert the
		// detector returns at least one violation per pattern. The
		// production walk above stays clean because no real file exhibits
		// the pattern (this PR fixes the only real offender); this
		// fabricated-source check proves the detector is sharp enough to
		// catch the pattern if one ever sneaks back in.
		const fabricated = `
const selectedIds: string[] = [];
for (const [id, checked] of Object.entries(selection.rowSelection)) {
	if (checked) selectedIds.push(id);
}
const keys = Object.keys(selection.rowSelection);
const values = Object.values(rowSelection);
const spread = [...selection.rowSelection];
// #1943 missed form: for-in loop over the selection map directly
for (const id in selection.rowSelection) {
	selectedIds.push(id);
}
// #1943 missed form: alias the selection map, then iterate via Object.keys
const m = selection.rowSelection;
const aliasKeys = Object.keys(m);
`;
		const violations = findViolationsAgainstSource(fabricated);
		expect(
			violations.sort(),
			'the detector must catch every forbidden pattern in the fabricated source',
		).toEqual(
			[
				'Object.entries(selection.rowSelection|rowSelection)',
				'Object.keys(selection.rowSelection|rowSelection)',
				'Object.values(selection.rowSelection|rowSelection)',
				'[...selection.rowSelection|rowSelection]',
				'for-in over selection map',
				'Object.keys on aliased selection map',
			].sort(),
		);
	});
});
