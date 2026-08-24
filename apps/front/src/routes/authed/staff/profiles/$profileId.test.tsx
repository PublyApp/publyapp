/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffProfileDetailsQuery: vi.fn(),
	useStaffProfilePermissionKeysQuery: vi.fn(),
	useStaffPermissionCatalogQuery: vi.fn(),
	useStaffProfileUsersQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn((..._args: unknown[]) => false),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useParams: () => ({
			profileId: '11111111-1111-1111-1111-111111111111',
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

vi.mock('~/lib/query/staff-profiles', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-profiles')>();

	return {
		toAssignedStaffPermissionGroups: vi.fn(() => []),
		// #980: the real mapper derives the fallback style, so the identity-tile
		// tests below exercise the production mapping path, not a mock.
		toStaffProfileDetails: vi.fn(actual.toStaffProfileDetails),
		useStaffProfileDetailsQuery: mocks.useStaffProfileDetailsQuery,
		useStaffProfilePermissionKeysQuery:
			mocks.useStaffProfilePermissionKeysQuery,
		useStaffPermissionCatalogQuery: mocks.useStaffPermissionCatalogQuery,
	};
});

vi.mock('~/lib/query/staff-profile-users', () => ({
	toStaffProfileUserRows: vi.fn(
		(users: unknown[] | null | undefined) => users ?? [],
	),
	useStaffProfileUsersQuery: mocks.useStaffProfileUsersQuery,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './$profileId';

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
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

describe('staff profile details route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.useStaffProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					profile: {
						id: '11111111-1111-1111-1111-111111111111',
						name: 'Platform admin',
						description: 'Full access',
						userAccountCount: 2,
						icon: 'shield-check',
						tone: '5',
					},
				},
			}),
		);
		mocks.useStaffProfilePermissionKeysQuery.mockReturnValue(
			buildQueryResult({
				data: {
					permissionKeys: ['staff.users.read'],
				},
			}),
		);
		mocks.useStaffPermissionCatalogQuery.mockReturnValue(buildQueryResult());
		mocks.useStaffProfileUsersQuery.mockReturnValue(buildQueryResult());
	});

	afterEach(() => {
		cleanup();
	});

	test('renders forbidden when the permission catalog query returns 403', () => {
		mocks.useStaffPermissionCatalogQuery.mockReturnValue(
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

	test('omits the member count metric entirely when it is null, instead of fabricating "0 members" or an em-dash (r5-F5)', () => {
		mocks.useStaffProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					profile: {
						id: '11111111-1111-1111-1111-111111111111',
						name: 'Empty profile',
						description: 'No description',
						userAccountCount: null,
					},
				},
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-profile-details-page')).toBeTruthy();
		const body = document.body.textContent ?? '';
		expect(body).not.toMatch(/0 member/);
		// A bare em-dash standing in for the unavailable count is just as
		// dishonest as fabricating "0 members" — both look like real data.
		expect(body).not.toContain('—');
	});

	test('renders a back link to the staff profiles list', () => {
		renderPage();

		const backLink = screen.getByRole('link', {
			name: /back-to-profiles/,
		}) as HTMLAnchorElement;
		expect(backLink.getAttribute('href')).toBe('/staff/profiles');
		expect(backLink.className).toContain('publy-back-link');
	});

	test('truncates the description with the full text in a title tooltip', () => {
		renderPage();

		const description = screen.getByText('Full access');
		expect(description.className).toContain('truncate');
		expect(description.getAttribute('title')).toBe('Full access');
	});

	test('does not set a title tooltip when the description is empty', () => {
		mocks.useStaffProfileDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					profile: {
						id: '11111111-1111-1111-1111-111111111111',
						name: 'Empty profile',
						description: null,
						userAccountCount: 0,
					},
				},
			}),
		);

		renderPage();

		const description = screen.getByText('no-description');
		expect(description.getAttribute('title')).toBeNull();
	});

	test('does not render a fabricated "Custom" chip in the identity header', () => {
		renderPage();

		const header = within(screen.getByTestId('staff-profile-identity-header'));
		expect(header.queryByText('Custom')).toBeNull();
		expect(header.getByText('profile')).toBeTruthy();
	});

	test('renders the persisted icon tone on the identity tile (#980)', () => {
		renderPage();

		const header = screen.getByTestId('staff-profile-identity-header');
		const tile = header.querySelector('.publy-profile-detail-tile');
		expect(tile).not.toBeNull();
		expect(tile?.getAttribute('data-tone')).toBe('5');
	});

	test('renders loading state for the members preview while users query is pending', () => {
		mocks.useStaffProfileUsersQuery.mockReturnValue(
			buildQueryResult({ isPending: true }),
		);

		renderPage();

		expect(screen.getByText('loading-staff-profile')).toBeTruthy();
		expect(screen.queryByText('no-members-yet')).toBeNull();
	});

	test('renders permission-specific members error for 403', () => {
		mocks.useStaffProfileUsersQuery.mockReturnValue(
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

		expect(
			screen.getByText('no-permission-to-view-assigned-users'),
		).toBeTruthy();
		expect(screen.queryByText('no-members-yet')).toBeNull();
	});

	test('renders retryable members preview error for non-403 failures', () => {
		mocks.useStaffProfileUsersQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 500,
					responseStatusCode: 500,
					title: 'Server Error',
					detail: 'Oops',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(
			screen.getByText('problem-loading-staff-profile-details'),
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'try-again' })).toBeTruthy();
	});

	test('logs out when the assigned-users query returns an auth failure', () => {
		mocks.shouldLogoutForFailure.mockImplementation(
			(error: unknown) =>
				typeof error === 'object' &&
				error !== null &&
				'status' in error &&
				(error as { status?: number }).status === 401,
		);
		mocks.useStaffProfileUsersQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 401,
					responseStatusCode: 401,
					title: 'Unauthorized',
					detail: 'Unauthorized',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		expect(
			screen.queryByText('problem-loading-staff-profile-details'),
		).toBeNull();
	});

	test('shows no members only after a successful users load with no rows', () => {
		mocks.useStaffProfileUsersQuery.mockReturnValue(
			buildQueryResult({
				data: { users: [], count: 0 },
			}),
		);

		renderPage();

		expect(screen.getByText('no-members-yet')).toBeTruthy();
	});

	test('does not show edit-permissions link and keeps view-all pointing to profile users', () => {
		renderPage();

		expect(screen.queryByText('edit-permissions')).toBeNull();
		const viewAllLink = screen.getByRole('link', {
			name: 'view-all-assigned-users',
		}) as HTMLAnchorElement;
		expect(viewAllLink.getAttribute('href')).toBe(
			'/staff/profiles/11111111-1111-1111-1111-111111111111/users',
		);
	});

	test('does not render a fabricated "Type" row in the About card', () => {
		renderPage();

		const page = within(screen.getByTestId('staff-profile-details-page'));
		expect(page.queryByText('Type')).toBeNull();
		expect(page.queryByText('Custom')).toBeNull();
	});
});
