/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: (props: { children?: ReactNode }) => props.children ?? null,
}));

import type { StaffRoleRow } from '~/lib/query/staff-roles';

import { buildStaffRoleFilters, staffRoleColumns } from './_role-columns';

const t = (key: string): string => key;

const row = (isFullAccess: boolean): StaffRoleRow => ({
	id: isFullAccess ? 'system' : 'custom',
	name: isFullAccess ? 'Staff Owner' : 'Support',
	description: null,
	userAccountCount: 0,
	isFullAccess,
	icon: 'shield',
	iconTone: '1',
});

describe('staff roles column grid', () => {
	afterEach(() => {
		cleanup();
	});

	test('uses the four designed columns in order', () => {
		const columns = staffRoleColumns(t);
		expect(columns.map((column) => column.id)).toEqual([
			'name',
			'type',
			'members',
			'description',
		]);
	});

	test('applies the Shopkart column widths, leaving Description fluid', () => {
		const columns = staffRoleColumns(t);
		expect(
			Object.fromEntries(columns.map((column) => [column.id, column.width])),
		).toEqual({
			name: 260,
			type: 140,
			members: 120,
			// SPEC 2g's `1fr`: no fixed width, the column absorbs the rest of
			// the card so the other three keep their handoff pixels.
			description: undefined,
		});
	});

	test('renders « Système » for the full-access role and « Personnalisé » otherwise', () => {
		const typeColumn = staffRoleColumns(t).find(
			(column) => column.id === 'type',
		);
		expect(typeColumn?.value).toBeDefined();

		const systemCell = typeColumn?.cell?.(row(true));
		const { unmount } = render(systemCell);
		expect(screen.getByText('list-role-type-system')).toBeTruthy();
		unmount();

		const customCell = typeColumn?.cell?.(row(false));
		render(customCell);
		expect(screen.getByText('list-role-type-custom')).toBeTruthy();
	});

	test('the Type filter classifies rows by isFullAccess', () => {
		const typeFilter = buildStaffRoleFilters(t).find(
			(filter) => filter.key === 'type',
		);

		expect(typeFilter?.valueOf?.(row(true))).toBe('system');
		expect(typeFilter?.valueOf?.(row(false))).toBe('custom');
	});
});
