/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

const LABELS: TestLabelMap = {
	'error-404-code': '404',
	'staff-profile-not-found': 'Staff profile not found',
	'staff-profile-not-found-description':
		'This staff profile does not exist anymore.',
	'back-to-staff-profiles': 'Back to staff profiles',
	'error-500-code': '500',
	'unable-to-load-staff-profile': 'Unable to load this staff profile',
	'problem-loading-staff-profile-details':
		'The staff profile details could not be loaded.',
	'try-again': 'Try again',
	'loading-staff-profile': 'Loading staff profile…',
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
	MissingProfileView,
	ProfileDetailsError,
	ProfileDetailsLoading,
} from './_users-page-states';

describe('profile users page state views (moved out of the users route file)', () => {
	afterEach(() => {
		cleanup();
	});

	test('the loading view renders a spinner and the loading label', () => {
		render(<ProfileDetailsLoading />);

		expect(screen.getByTestId('staff-profile-users-loading')).toBeTruthy();
		expect(screen.getByTestId('loading-spinner')).toBeTruthy();
		expect(screen.getByText('Loading staff profile…')).toBeTruthy();
	});

	test('a 404 problem renders the not-found view with the problem detail', () => {
		render(
			<MissingProfileView
				error={{ status: 404, detail: 'No profile with this id.' }}
			/>,
		);

		expect(screen.getByTestId('staff-profile-users-not-found')).toBeTruthy();
		expect(screen.getByText('Staff profile not found')).toBeTruthy();
		expect(screen.getByText('No profile with this id.')).toBeTruthy();
	});

	test('a 403 problem renders the forbidden view without logging out', () => {
		render(<ProfileDetailsError error={{ status: 403 }} onRetry={() => {}} />);

		expect(screen.getByText('view-403')).toBeTruthy();
	});

	test('any other problem renders the retry view with a working retry action', () => {
		const onRetry = vi.fn();
		render(<ProfileDetailsError error={{ status: 500 }} onRetry={onRetry} />);

		expect(screen.getByTestId('staff-profile-users-error')).toBeTruthy();

		const tryAgain = screen.getByText('Try again') as HTMLButtonElement;
		tryAgain.click();
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
