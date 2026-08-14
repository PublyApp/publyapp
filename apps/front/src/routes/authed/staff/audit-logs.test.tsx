/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	Link: (props: { children?: ReactNode }) => props.children ?? null,
}));

import { makeAuditLogColumns } from './audit-logs';

const t = (key: string): string => key;

describe('staff audit logs column grid', () => {
	test('applies the column grid across the contract-backed columns', () => {
		const columns = makeAuditLogColumns(t, 'en');
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			event: '240px',
			user: '220px',
			'target-id': '160px',
			'ip-address': '140px',
			created_at: '200px',
			actions: '40px',
		});
	});

	test('only the created_at column is backend-sortable', () => {
		const columns = makeAuditLogColumns(t, 'en');

		for (const column of columns) {
			if (column.id === 'created_at') {
				expect(column.enableSorting).not.toBe(false);
			} else {
				expect(column.enableSorting).toBe(false);
			}
		}
	});

	test('drops fluid-width columns on narrow viewports and keeps the event link', () => {
		const columns = makeAuditLogColumns(t, 'en');
		const hidden = columns
			.filter((column) => column.meta?.hideBelow != null)
			.map((column) => column.id);

		expect(hidden.sort()).toEqual(['ip-address', 'target-id', 'user']);
	});
});
