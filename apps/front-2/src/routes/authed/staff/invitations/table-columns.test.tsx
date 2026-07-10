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
});
