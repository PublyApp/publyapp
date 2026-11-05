/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { StaffUserRow } from '~/lib/query/staff-users';

import { staffUserColumns } from './_staff-users-list-config';

const t = (key: string): string => key;

const rowWithProfiles = (profileNames: string[]): StaffUserRow => ({
	id: 'user-1',
	email: 'user-1@example.com',
	firstName: 'Sarah',
	lastName: 'Rakoto',
	avatarUrl: null,
	level: null,
	status: null,
	displayName: 'Sarah Rakoto',
	profileNames,
});

const profilesCell = (profileNames: string[]) => {
	const column = staffUserColumns(t).find(
		(candidate) => candidate.id === 'profiles',
	);
	return column?.cell?.(rowWithProfiles(profileNames));
};

afterEach(() => {
	cleanup();
});

describe('staff users « Profils » column', () => {
	test('renders one pill per profile assigned to the row', () => {
		render(<>{profilesCell(['Super administrateurs', 'Support client'])}</>);

		expect(screen.getByText('Super administrateurs')).toBeTruthy();
		expect(screen.getByText('Support client')).toBeTruthy();
	});

	test('renders « — » when the API returned no profile for the user', () => {
		render(<>{profilesCell([])}</>);

		expect(screen.getByText('—')).toBeTruthy();
	});
});
