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
	// `StaffProfileItem` carries only description/id/name/userAccountCount —
	// no permission count, no updated_at (packages/client-ts/src/models/index.ts).
	// Per docs/guides/front/conventions.md's data-honesty rule, a column with
	// no backing field must not exist rather than render a fabricated "—".
	test('applies the column grid across the columns the contract can back', () => {
		const columns = buildColumns(t);
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			name: '240px',
			description: undefined,
			members: '104px',
			actions: '40px',
		});
	});

	test('never renders a permissions or updated column the API does not back', () => {
		const columns = buildColumns(t);
		const ids = columns.map((column) => column.id);

		expect(ids).toEqual(['name', 'description', 'members', 'actions']);
	});
});
