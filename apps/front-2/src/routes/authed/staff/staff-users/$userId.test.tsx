/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	toStaffUserDetails: vi.fn(),
	useStaffUserDetailsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useParams: () => ({
			userId: '11111111-1111-1111-1111-111111111111',
		}),
	}),
	Link: ({
		children,
		to,
		...props
	}: {
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: {
			language: 'en',
		},
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-users', () => ({
	toStaffUserDetails: mocks.toStaffUserDetails,
	useStaffUserDetailsQuery: mocks.useStaffUserDetailsQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$userId';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

describe('staff user details route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					id: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
		mocks.toStaffUserDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			email: 'owner@publyapp.local',
			firstName: 'Owner',
			lastName: 'User',
			avatarUrl: null,
			accountLevel: 'Owner',
			status: 'Active',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Owner User',
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the read-only basics shell with the profiles placeholder', () => {
		renderPage();

		expect(screen.getByTestId('staff-user-details-page')).toBeTruthy();
		expect(screen.getByText('Back to staff users')).toBeTruthy();
		expect(screen.getByText('Owner User')).toBeTruthy();
		expect(screen.getAllByText('owner@publyapp.local')).toHaveLength(2);
		expect(screen.getByText('Owner')).toBeTruthy();
		expect(screen.getByText('Active')).toBeTruthy();
		expect(screen.getAllByText('Basics')).toHaveLength(2);
		expect(screen.getByText('Profiles')).toBeTruthy();
	});

	test('renders a local malformed id view for 400 malformed-id failures', () => {
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid userId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-user-details-invalid')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Forbidden',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('forbidden-view')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders a local not found view for 404 failures', () => {
		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 404,
					responseStatusCode: 404,
					title: 'Not Found',
					detail: 'Missing user',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-user-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('uses logout redirect for 401 failures', () => {
		const error = {
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		};

		mocks.useStaffUserDetailsQuery.mockReturnValue(
			buildQueryResult({
				error,
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
