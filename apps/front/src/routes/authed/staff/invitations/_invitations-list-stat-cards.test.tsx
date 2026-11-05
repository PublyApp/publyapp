/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { InvitationsStatCards } from './_invitations-list-stat-cards';

const t = (key: string, options?: Record<string, unknown>): string =>
	options ? `${key}:${Object.values(options).join(',')}` : key;

afterEach(() => {
	cleanup();
});

describe('InvitationsStatCards', () => {
	test('shows the API whole-collection counts', () => {
		render(
			<InvitationsStatCards
				t={t}
				counts={{
					total: 10,
					pending: 5,
					accepted: 3,
					expired: 1,
					revoked: 1,
					expiringSoon: 2,
				}}
			/>,
		);

		expect(
			screen.getByTestId('staff-invitation-stat-pending').textContent,
		).toContain('5');
		expect(
			screen.getByTestId('staff-invitation-stat-pending').textContent,
		).toContain('list-stat-invitations-expiring:2');
		expect(
			screen.getByTestId('staff-invitation-stat-accepted').textContent,
		).toContain('3');
		expect(
			screen.getByTestId('staff-invitation-stat-expired').textContent,
		).toContain('2');
	});

	test('shows « — » only when the API has no counts', () => {
		render(<InvitationsStatCards t={t} counts={null} />);
		expect(screen.getAllByText('—')).toHaveLength(6);
	});
});
