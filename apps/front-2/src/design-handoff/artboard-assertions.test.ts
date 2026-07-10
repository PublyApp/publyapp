import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
	ALL_HANDOFF_ARTBOARD_IDS,
	ARTBOARD_ASSERTION_COVERAGE,
	DELIVERED_ARTBOARD_IDS,
	JSON_BACKED_ARTBOARD_IDS,
	PROSE_BACKED_ARTBOARD_IDS,
} from './artboard-assertions';

type CoveredArtboardIds = string[];
type BundleSpec = {
	meta: {
		artboards_delivered: string[];
	};
	artboards: Record<string, unknown>;
};

const toSorted = (items: CoveredArtboardIds): CoveredArtboardIds =>
	[...new Set(items)].sort();

const readBundleSpec = (): BundleSpec | undefined => {
	const specUrl = new URL(
		'../../../../.dump/design_handoff_publyapp_front2/spec.json',
		import.meta.url,
	);

	if (!existsSync(specUrl)) {
		return undefined;
	}

	return JSON.parse(readFileSync(specUrl, 'utf8')) as BundleSpec;
};

test('covers all required handoff artboards', () => {
	const bundleSpec = readBundleSpec();
	if (bundleSpec) {
		expect(toSorted(bundleSpec.meta.artboards_delivered)).toEqual(
			toSorted([...DELIVERED_ARTBOARD_IDS]),
		);
		expect(toSorted(Object.keys(bundleSpec.artboards))).toEqual(
			toSorted([...JSON_BACKED_ARTBOARD_IDS]),
		);
	}

	expect(DELIVERED_ARTBOARD_IDS).toHaveLength(57);
	expect(
		toSorted([...JSON_BACKED_ARTBOARD_IDS, ...PROSE_BACKED_ARTBOARD_IDS]),
	).toEqual(toSorted([...DELIVERED_ARTBOARD_IDS]));
	expect(toSorted(Object.keys(ARTBOARD_ASSERTION_COVERAGE))).toEqual(
		toSorted([...DELIVERED_ARTBOARD_IDS]),
	);
	expect(ALL_HANDOFF_ARTBOARD_IDS).toEqual(
		toSorted([...DELIVERED_ARTBOARD_IDS]),
	);

	for (const artboardId of JSON_BACKED_ARTBOARD_IDS) {
		expect(ARTBOARD_ASSERTION_COVERAGE[artboardId].source).toBe('json-backed');
		expect(
			ARTBOARD_ASSERTION_COVERAGE[artboardId].focus.length,
		).toBeGreaterThan(0);
	}

	for (const artboardId of PROSE_BACKED_ARTBOARD_IDS) {
		expect(ARTBOARD_ASSERTION_COVERAGE[artboardId].source).toBe('prose-backed');
		expect(
			ARTBOARD_ASSERTION_COVERAGE[artboardId].focus.length,
		).toBeGreaterThan(0);
		expect(ARTBOARD_ASSERTION_COVERAGE[artboardId].notes[0]).toContain(
			'SPEC.md prose',
		);
		for (const focus of ARTBOARD_ASSERTION_COVERAGE[artboardId].focus) {
			expect(focus.property).not.toBe('pending');
			expect(focus.expected).not.toContain('Add explicit assertions');
		}
	}
});

describe('focused handoff assertions are structured for regression checks', () => {
	test('maps token/radius/layout focus for 2a from spec assertions', () => {
		const focus = ARTBOARD_ASSERTION_COVERAGE['2a']?.focus;
		expect(focus).toBeDefined();

		expect(
			focus?.some(
				(entry) => entry.kind === 'layout' && entry.property === 'width',
			),
		).toBe(true);
		expect(
			focus?.some(
				(entry) =>
					entry.kind === 'radius' && entry.property === 'border-radius',
			),
		).toBe(true);
		expect(
			focus?.some(
				(entry) =>
					entry.kind === 'layout' && entry.property === 'grid-template-columns',
			),
		).toBe(true);
	});

	test('assertion objects include the source and notes contract', () => {
		const sample = ARTBOARD_ASSERTION_COVERAGE['3a'];
		expect(sample.source).toBe('json-backed');
		expect(sample.notes[0]).toBe(
			'JSON-backed assertions mirrored from spec.json.',
		);
	});

	test('captures focused contract checkpoints for primitives', () => {
		const contractScope = ['2a', '2d', '2e', '2f', '3c', '5d', '6a', '6b'];
		for (const artboardId of contractScope) {
			const focus = ARTBOARD_ASSERTION_COVERAGE[artboardId]?.focus;
			expect(focus?.length).toBeGreaterThan(0);
		}

		const focusItems = contractScope.flatMap(
			(artboardId) => ARTBOARD_ASSERTION_COVERAGE[artboardId]?.focus ?? [],
		);
		expect(
			focusItems.some(
				(item) =>
					item.component === 'field.input' &&
					item.property === 'border-radius' &&
					item.expected === '10px',
			),
		).toBe(true);
		expect(
			focusItems.some(
				(item) =>
					item.component === 'table.statusChip' &&
					item.property === 'border-radius' &&
					item.expected === '8px',
			),
		).toBe(true);
		expect(
			focusItems.some(
				(item) =>
					item.component === 'card.button' &&
					item.property === 'border-radius' &&
					item.expected === '14px',
			),
		).toBe(true);
		expect(
			focusItems.some(
				(item) =>
					item.component === 'modal' &&
					item.property === 'border-radius' &&
					item.expected === '28px',
			),
		).toBe(true);
		expect(
			focusItems.some(
				(item) =>
					item.component === 'error.icon' &&
					item.property === 'width' &&
					item.expected === '64px',
			),
		).toBe(true);
		expect(
			focusItems.some(
				(item) =>
					item.component === 'topbar.iconButton' &&
					item.property === 'border-radius' &&
					item.expected === '999px',
			),
		).toBe(true);
	});
});
