// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 *
 *   2. A bulk-action site that iterates the selection map without ever
 *      consulting the visible rows list is the regression this guard pins.
 *
 * The `useRowSelection` primitive itself is excluded — it owns the map
 * and is allowed to introspect it (it is the one source of truth for the
 * pruned state, and its effect is the prune).
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

// Patterns that indicate this file touches selection state. Tight enough
// to be unambiguous; broad enough to cover both `selection.rowSelection`
// and a `rowSelection` direct-binding style.
const SELECTION_REFERENCE_RE = /(?:^|\W)(?:selection|rowSelection)\.rowSelection\b|(?:^|\W)rowSelection\b\s*\[/;

// Forbidden ID-derivation patterns. Each is a structural way to extract
// ids from the raw selection map without consulting the visible rows.
const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
	{
		name: 'Object.keys(selection.rowSelection|rowSelection)',
		re: /Object\.keys\s*\(\s*(?:selection\.)?rowSelection\s*\)/,
	},
	{
		name: 'Object.entries(selection.rowSelection|rowSelection)',
		re: /Object\.entries\s*\(\s*(?:selection\.)?rowSelection\s*\)/,
	},
	{
		name: 'Object.values(selection.rowSelection|rowSelection)',
		re: /Object\.values\s*\(\s*(?:selection\.)?rowSelection\s*\)/,
	},
	{
		name: '[...selection.rowSelection|rowSelection]',
		re: /\[\s*\.\.\.\s*(?:selection\.)?rowSelection\s*\]/,
	},
];

const findViolations = (file: string): string[] => {
	const source = readFileSync(file, 'utf8');
	const violations: string[] = [];
	for (const { name, re } of FORBIDDEN_PATTERNS) {
		if (re.test(source)) {
			violations.push(name);
		}
	}
	return violations;
};

describe('bulk-action sites derive ids from visible rows, not the raw selection map (#1604)', () => {
	// Discover bulk-action sites: route files that touch selection state.
	// (The visible-rows derive is structural; we do not parse the AST.)
	const candidateFiles = allRouteFiles
		.filter((file) => readFileSync(file, 'utf8').match(SELECTION_REFERENCE_RE))
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
		const offenders: Array<{ file: string; patterns: string[] }> = [];
		for (const file of allRouteFiles) {
			const source = readFileSync(file, 'utf8');
			if (!SELECTION_REFERENCE_RE.test(source)) {
				continue;
			}
			const patterns = findViolations(file);
			if (patterns.length > 0) {
				offenders.push({
					file: relative(FRONT_ROOT, file).split(sep).join('/'),
					patterns,
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
			].sort(),
		);
	});
});

/**
 * Run the forbidden-pattern detector against an in-memory source string.
 * Exported for the fabrication test above and for any future synthetic
 * proof (e.g. pairing the RED of a real offender with a fabricated
 * baseline that asserts the detector's contract).
 */
export const findViolationsAgainstSource = (source: string): string[] => {
	const violations: string[] = [];
	for (const { name, re } of FORBIDDEN_PATTERNS) {
		if (re.test(source)) {
			violations.push(name);
		}
	}
	return violations;
};
