/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: (props: { children?: ReactNode }) => props.children ?? null,
}));

import { staffProfileColumns } from './_profile-columns';

const t = (key: string): string => key;

describe('staff profiles column grid', () => {
	test('uses the four designed columns in order', () => {
		const columns = staffProfileColumns(t);
		expect(columns.map((column) => column.id)).toEqual([
			'name',
			'type',
			'members',
			'description',
		]);
	});

	test('applies the Shopkart column widths', () => {
		const columns = staffProfileColumns(t);
		expect(
			Object.fromEntries(columns.map((column) => [column.id, column.width])),
		).toEqual({
			name: 260,
			type: 140,
			members: 120,
			description: 380,
		});
	});

	test('renders Type as a dash because StaffProfileItem has no system flag', () => {
		const columns = staffProfileColumns(t);
		const typeColumn = columns.find((column) => column.id === 'type');
		expect(typeColumn?.value).toBeUndefined();
		expect(typeColumn?.sortable).toBe(false);
	});
});
