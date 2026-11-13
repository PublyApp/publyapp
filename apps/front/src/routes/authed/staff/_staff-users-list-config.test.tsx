/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { StaffUserRow } from '~/lib/query/staff-users';

import {
	buildStaffUserFilters,
	buildStaffUserTotals,
	staffUserColumns,
} from './_staff-users-list-config';

const t = (key: string): string => key;

const row = (overrides: Partial<StaffUserRow> = {}): StaffUserRow => ({
	id: 'user-1',
	email: 'user-1@example.com',
	firstName: 'Sarah',
	lastName: 'Rakoto',
	avatarUrl: null,
	isFullAccess: false,
	roles: [],
	status: null,
	displayName: 'Sarah Rakoto',
	openSessions: 0,
	lastSignInAt: null,
	invitedByName: null,
	createdAt: null,
	...overrides,
});

const cell = (id: string, value: StaffUserRow) => {
	const column = staffUserColumns(t, 'en').find(
		(candidate) => candidate.id === id,
	);
	return column?.cell?.(value);
};

afterEach(() => {
	cleanup();
});

describe('staff users list API-backed columns', () => {
	test('shows the open sessions count, including zero', () => {
		render(<>{cell('sessions', row({ openSessions: 3 }))}</>);
		expect(screen.getByText('3')).toBeTruthy();
		cleanup();
		render(<>{cell('sessions', row({ openSessions: 0 }))}</>);
		expect(screen.getByText('0')).toBeTruthy();
	});

	test('shows the last sign-in date, or a dash when the member never signed in', () => {
		render(
			<>
				{cell(
					'lastLogin',
					row({ lastSignInAt: new Date('2026-11-10T09:30:00Z') }),
				)}
			</>,
		);
		expect(screen.queryByText('—')).toBeNull();
		cleanup();
		render(<>{cell('lastLogin', row())}</>);
		expect(screen.getByText('—')).toBeTruthy();
	});

	test('shows who invited the member, or a dash when not invited', () => {
		render(<>{cell('invitedBy', row({ invitedByName: 'Jean Admin' }))}</>);
		expect(screen.getByText('Jean Admin')).toBeTruthy();
		cleanup();
		render(<>{cell('invitedBy', row())}</>);
		expect(screen.getByText('—')).toBeTruthy();
	});

	test('shows the account creation date in « Membre depuis », or a dash when unknown', () => {
		render(
			<>
				{cell(
					'createdAt',
					row({ createdAt: new Date('2026-01-15T09:30:00Z') }),
				)}
			</>,
		);
		expect(screen.queryByText('—')).toBeNull();
		cleanup();
		render(<>{cell('createdAt', row())}</>);
		expect(screen.getByText('—')).toBeTruthy();
	});

	test('titles the access-level facet apart from the per-role panel and sends it to the API', () => {
		const filters = buildStaffUserFilters(t);
		const access = filters.find((filter) => filter.key === 'role');
		expect(access?.label).toBe('list-access-level');
		expect(access?.label).not.toBe('list-roles');
		expect(access?.serverSide).toBe(true);
	});

	test('keeps 2FA and language at the dash: no source exists', () => {
		for (const id of ['twoFactor', 'locale']) {
			render(<>{cell(id, row({ openSessions: 5 }))}</>);
			expect(screen.getByText('—')).toBeTruthy();
			cleanup();
		}
	});

	test('totals the open sessions from the whole-collection counts', () => {
		const totals = buildStaffUserTotals(t, {
			total: 12,
			active: 9,
			suspended: 3,
			fullAccess: 4,
			openSessions: 7,
		});
		expect(totals.get('sessions')).toBe('7');
	});
});
