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

import { staffRoleColumns } from './_role-columns';

const t = (key: string): string => key;

describe('staff roles column grid', () => {
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

	test('renders Type as the custom pill: staff roles are never system', () => {
		const columns = staffRoleColumns(t);
		const typeColumn = columns.find((column) => column.id === 'type');
		// Every staff role is « Personnalisé » (Role.ValidateRoleType
		// forbids a default staff role), so the column carries a real value.
		expect(typeColumn?.value).toBeDefined();
		expect(typeColumn?.sortable).toBe(false);
	});
});
