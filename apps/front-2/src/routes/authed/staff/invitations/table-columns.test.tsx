/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				href = href.replace(`$${key}`, value);
			}
		}
		return createElement('a', { href, ...props }, children);
	},
}));

import { createInvitationColumns } from './table-columns';

const t = (key: string): string => key;

describe('createInvitationColumns', () => {
	test('marks the Profiles column as non-sortable because the staff invitations API does not support profile_name sorting', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
		});
		const profileColumn = columns.find(
			(column) => column.id === 'profile_name',
		);

		expect(profileColumn).toMatchObject({
			id: 'profile_name',
			enableSorting: false,
		});
	});

	test('applies the SPEC 2i column grid, leaving exactly one fluid column', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
		});
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			email: '300px',
			role: '116px',
			profile_name: undefined,
			invited_by_name: '150px',
			expires_at: '120px',
			status: '128px',
			actions: '40px',
		});
	});

	test('centres the actions column via meta.align instead of a per-route wrapper', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
		});
		const actionsColumn = columns.find((column) => column.id === 'actions');

		expect(actionsColumn?.meta?.align).toBe('center');
	});

	test('renders the first column as a link to the invitation detail route, keeping the email text', () => {
		const columns = createInvitationColumns({
			t,
			locale: 'en',
			onActionSuccess: () => undefined,
		});
		const emailColumn = columns.find((column) => column.id === 'email');
		const row = {
			original: {
				id: 'invitation-1',
				email: 'person@example.com',
				profileName: 'Ops',
				invitedByName: 'Jane',
				status: 'pending',
				acceptedAt: null,
				createdAt: null,
				expiresAt: null,
			},
		};

		const cellRenderer = emailColumn?.cell as (props: {
			row: typeof row;
		}) => ReactNode;
		render(cellRenderer({ row }));

		const link = screen.getByRole('link', { name: /person@example\.com/ });
		expect(link.getAttribute('href')).toBe('/staff/invitations/invitation-1');
	});
});
