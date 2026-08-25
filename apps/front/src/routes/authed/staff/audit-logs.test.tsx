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

import { render, screen } from '@testing-library/react';

import { makeAuditLogColumns } from './audit-logs/_audit-log-columns';

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

	test('renders the translated action-category badge above the event link', () => {
		const translate = (key: string): string =>
			key === 'action-kind-user' ? 'User category' : key;
		const columns = makeAuditLogColumns(translate, 'en');
		const eventCell = columns[0].cell as
			| ((context: { row: { original: Record<string, unknown> } }) => ReactNode)
			| undefined;

		render(
			eventCell?.({
				row: {
					original: {
						id: 'log-1',
						action: 'user.created',
						userName: null,
						userEmail: null,
						ipAddress: null,
						targetId: null,
						createdAt: null,
					},
				},
			}) ?? null,
		);

		expect(screen.getByText('User category')).toBeTruthy();
		expect(screen.getByText('user.created')).toBeTruthy();
	});
});
