import { describe, expect, test } from 'vitest';

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
});
