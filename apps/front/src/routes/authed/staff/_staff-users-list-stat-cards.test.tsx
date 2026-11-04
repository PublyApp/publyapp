/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { StaffUsersStatCards } from './_staff-users-list-stat-cards';

const t = (key: string, options?: Record<string, unknown>): string =>
	options ? `${key}:${Object.values(options).join(',')}` : key;

afterEach(() => {
	cleanup();
});

describe('StaffUsersStatCards', () => {
	test('shows the API whole-collection counts', () => {
		render(
			<StaffUsersStatCards
				t={t}
				counts={{
					total: 12,
					active: 9,
					suspended: 3,
					admins: 4,
					users: 8,
				}}
			/>,
		);

		expect(screen.getByTestId('staff-user-stat-total').textContent).toContain(
			'12',
		);
		expect(screen.getByTestId('staff-user-stat-total').textContent).toContain(
			'list-staff-stat-active:9',
		);
		expect(screen.getByTestId('staff-user-stat-admins').textContent).toContain(
			'4',
		);
		expect(screen.getByTestId('staff-user-stat-admins').textContent).toContain(
			'list-staff-stat-users:8',
		);
	});

	test('shows « — » only when the API has no counts', () => {
		render(<StaffUsersStatCards t={t} counts={null} />);
		for (const testId of [
			'staff-user-stat-total',
			'staff-user-stat-admins',
			'staff-user-stat-connected-today',
		]) {
			expect(screen.getByTestId(testId).textContent).toContain('—');
		}
	});

	test('keeps Double authentification at « — »: no 2FA source exists', () => {
		render(
			<StaffUsersStatCards
				t={t}
				counts={{
					total: 12,
					active: 9,
					suspended: 3,
					admins: 4,
					users: 8,
					connectedToday: 5,
					openSessions: 7,
				}}
			/>,
		);

		const twoFactor = screen.getByTestId('staff-user-stat-two-factor');
		expect(twoFactor.textContent).toContain('—');
		expect(twoFactor.textContent).toContain(
			'list-staff-stat-two-factor-unavailable',
		);
		expect(twoFactor.textContent).not.toContain('%');

		const connected = screen.getByTestId('staff-user-stat-connected-today');
		expect(connected.textContent).toContain('5');
		expect(connected.textContent).toContain('list-staff-stat-open-sessions:7');
	});
});
