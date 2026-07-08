/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	toAssignedStaffProfiles: vi.fn(),
	toStaffUserDetails: vi.fn(),
	useStaffUserProfilesQuery: vi.fn(),
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
		params,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
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
	toAssignedStaffProfiles: mocks.toAssignedStaffProfiles,
	toStaffUserDetails: mocks.toStaffUserDetails,
	useStaffUserProfilesQuery: mocks.useStaffUserProfilesQuery,
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
		mocks.useStaffUserProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					assignedProfiles: [
						{
							id: 'profile-1',
							name: 'Platform admin',
							description: 'Full access',
						},
						{
							id: 'profile-2',
							name: 'Support staff',
							description: null,
						},
					],
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
		mocks.toAssignedStaffProfiles.mockReturnValue([
			{
				id: 'profile-1',
				name: 'Platform admin',
				description: 'Full access',
			},
			{
				id: 'profile-2',
				name: 'Support staff',
				description: null,
			},
		]);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders "No email address" fallback when email is empty', () => {
		mocks.toStaffUserDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			email: '',
			firstName: 'Owner',
			lastName: 'User',
			avatarUrl: null,
			accountLevel: 'Owner',
			status: 'Active',
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
			displayName: 'Owner User',
		});

		renderPage();

		const matches = screen.getAllByText('No email address');
		expect(matches).toHaveLength(2);
	});

	test('renders the read-only basics shell with the assigned profiles section', () => {
		renderPage();

		expect(screen.getByTestId('staff-user-details-page')).toBeTruthy();
		expect(screen.getByText('Back to staff users')).toBeTruthy();
		expect(screen.getAllByText('Owner User')).toHaveLength(2);
		expect(screen.getAllByText('owner@publyapp.local')).toHaveLength(2);
		expect(screen.getByText('Owner')).toBeTruthy();
		expect(screen.getAllByText('Active')).toHaveLength(2);
		expect(screen.getByText('Account')).toBeTruthy();
		expect(screen.getByText('Assigned profiles')).toBeTruthy();
		expect(screen.getByText('2 assigned')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Platform admin' })).toBeTruthy();
		expect(screen.getByText('Full access')).toBeTruthy();
		expect(screen.getByText('No description provided.')).toBeTruthy();
	});

	test('renders the assigned profiles empty state when none are assigned', () => {
		mocks.toAssignedStaffProfiles.mockReturnValue([]);

		renderPage();

		expect(screen.getByText('0 assigned')).toBeTruthy();
		expect(
			screen.getByText('This staff user does not have any assigned profiles.'),
		).toBeTruthy();
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

	test.each([
		{
			status: 400,
			responseStatusCode: 400,
			title: 'Bad Request',
			detail: 'Invalid userId',
			translationKey: 'malformed-id',
		},
		{
			status: 403,
			responseStatusCode: 403,
			title: 'Forbidden',
			detail: 'Forbidden',
		},
		{
			status: 404,
			responseStatusCode: 404,
			title: 'Not Found',
			detail: 'Missing assignments',
		},
	])(
		'renders a local assigned profiles error for %o without logging out',
		(error) => {
			mocks.useStaffUserProfilesQuery.mockReturnValue(
				buildQueryResult({
					error,
					isError: true,
				}),
			);

			renderPage();

			expect(screen.getByTestId('staff-user-details-page')).toBeTruthy();
			expect(screen.getByTestId('staff-user-profiles-error')).toBeTruthy();
			expect(screen.queryByTestId('logout-redirect')).toBeNull();
		},
	);

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

	test('uses logout redirect for 401 failures from the assigned profiles query', () => {
		const error = {
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		};

		mocks.useStaffUserProfilesQuery.mockReturnValue(
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
