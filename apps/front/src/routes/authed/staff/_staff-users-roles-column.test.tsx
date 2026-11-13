/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { StaffUserRow } from '~/lib/query/staff-users';

import { staffUserColumns } from './_staff-users-list-config';

const t = (key: string): string => key;

const rowWithRoles = (roles: string[]): StaffUserRow => ({
	id: 'user-1',
	email: 'user-1@example.com',
	firstName: 'Sarah',
	lastName: 'Rakoto',
	avatarUrl: null,
	isFullAccess: false,
	roles,
	status: null,
	displayName: 'Sarah Rakoto',
	openSessions: 0,
	lastSignInAt: null,
	invitedByName: null,
	createdAt: null,
});

const rolesCell = (roles: string[]) => {
	const column = staffUserColumns(t).find(
		(candidate) => candidate.id === 'roles',
	);
	return column?.cell?.(rowWithRoles(roles));
};

afterEach(() => {
	cleanup();
});

describe('staff users « Rôles » column', () => {
	test('renders one pill per role assigned to the row', () => {
		render(<>{rolesCell(['Super administrateurs', 'Support client'])}</>);

		expect(screen.getByText('Super administrateurs')).toBeTruthy();
		expect(screen.getByText('Support client')).toBeTruthy();
	});

	test('renders « — » when the API returned no role for the user', () => {
		render(<>{rolesCell([])}</>);

		expect(screen.getByText('—')).toBeTruthy();
	});
});
