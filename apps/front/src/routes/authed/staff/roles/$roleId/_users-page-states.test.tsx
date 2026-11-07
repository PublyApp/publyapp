/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

const LABELS: TestLabelMap = {
	'error-404-code': '404',
	'staff-role-not-found': 'Staff role not found',
	'staff-role-not-found-description': 'This staff role does not exist anymore.',
	'back-to-staff-roles': 'Back to staff roles',
	'error-500-code': '500',
	'unable-to-load-staff-role': 'Unable to load this staff role',
	'problem-loading-staff-role-details':
		'The staff role details could not be loaded.',
	'try-again': 'Try again',
	'loading-staff-role': 'Loading staff role…',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => LABELS[key] ?? key,
	}),
}));

vi.mock('~/components/ui/loading-spinner', () => ({
	LoadingSpinner: () => <span data-testid="loading-spinner" />,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div>view-403</div>,
}));

import {
	MissingRoleView,
	RoleDetailsError,
	RoleDetailsLoading,
} from './_users-page-states';

describe('role users page state views (moved out of the users route file)', () => {
	afterEach(() => {
		cleanup();
	});

	test('the loading view renders a spinner and the loading label', () => {
		render(<RoleDetailsLoading />);

		expect(screen.getByTestId('staff-role-users-loading')).toBeTruthy();
		expect(screen.getByTestId('loading-spinner')).toBeTruthy();
		expect(screen.getByText('Loading staff role…')).toBeTruthy();
	});

	test('a 404 problem renders the not-found view with the classified sentence', () => {
		render(<MissingRoleView />);

		expect(screen.getByTestId('staff-role-users-not-found')).toBeTruthy();
		expect(screen.getByText('Staff role not found')).toBeTruthy();
		// ShopKart's not-found family owns one sentence per kind.
		expect(screen.getByText('not-found-sentence')).toBeTruthy();
		// #2291 M1: the API's English detail is never painted under the title.
		expect(screen.queryByText('No role with this id.')).toBeNull();
	});

	test('a 403 problem renders the forbidden view without logging out', () => {
		render(<RoleDetailsError error={{ status: 403 }} onRetry={() => {}} />);

		expect(screen.getByText('view-403')).toBeTruthy();
	});

	test('any other problem renders the retry view with a working retry action', () => {
		const onRetry = vi.fn();
		render(<RoleDetailsError error={{ status: 500 }} onRetry={onRetry} />);

		expect(screen.getByTestId('staff-role-users-error')).toBeTruthy();

		const tryAgain = screen.getByRole('button', {
			name: /retry/i,
		}) as HTMLButtonElement;
		tryAgain.click();
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
