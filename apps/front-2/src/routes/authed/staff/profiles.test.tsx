/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	Link: (props: { children?: ReactNode }) => props.children ?? null,
}));

import { buildColumns } from './profiles';

const t = (key: string): string => key;

describe('staff profiles column grid', () => {
	// SPEC 2g grid: 40 / 240 / 1fr / 104 / 140 / 120 / 40 — the permissions
	// and updated columns were silently dropped in 506351cf (an i18n-only
	// sweep that removed two whole columns instead of just re-keying their
	// labels), which broke this grid a second time on this branch. Pinning
	// the per-column width shape here means any future column drop or width
	// edit shows up as a vitest failure, not just a docker e2e one.
	test('applies the SPEC 2g column grid across all six columns', () => {
		const columns = buildColumns(t);
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			name: '240px',
			description: undefined,
			members: '104px',
			permissions: '140px',
			updated: '120px',
			actions: '40px',
		});
	});

	test('never drops the permissions or updated columns', () => {
		const columns = buildColumns(t);
		const ids = columns.map((column) => column.id);

		expect(ids).toEqual([
			'name',
			'description',
			'members',
			'permissions',
			'updated',
			'actions',
		]);
	});
});
