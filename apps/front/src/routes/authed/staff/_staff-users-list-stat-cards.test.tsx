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
		expect(screen.getAllByText('—')).toHaveLength(4);
	});
});
