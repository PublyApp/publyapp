/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffProfileDetailsQuery: vi.fn(),
	useStaffProfilePermissionKeysQuery: vi.fn(),
	useStaffPermissionCatalogQuery: vi.fn(),
	useStaffProfileUsersQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
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

vi.mock('~/lib/query/staff-profiles', () => ({
	toAssignedStaffPermissionGroups: vi.fn(() => []),
	toStaffProfileDetails: vi.fn(
		(result: { profile?: Record<string, unknown> }) => {
			const profile = result.profile ?? {};

			return {
				id: profile.id ?? '11111111-1111-1111-1111-111111111111',
				name: profile.name ?? 'Platform admin',
				description: profile.description ?? null,
				userAccountCount:
					'userAccountCount' in profile ? profile.userAccountCount : 2,
				icon: 'shield',
				iconTone: '0',
			};
		},
	),
	useStaffProfileDetailsQuery: mocks.useStaffProfileDetailsQuery,
	useStaffProfilePermissionKeysQuery: mocks.useStaffProfilePermissionKeysQuery,
	useStaffPermissionCatalogQuery: mocks.useStaffPermissionCatalogQuery,
}));

vi.mock('~/lib/query/staff-profile-users', () => ({
	toStaffProfileUserRows: vi.fn(() => []),
	useStaffProfileUsersQuery: mocks.useStaffProfileUsersQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
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
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

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

	test('renders em-dash when member count is null instead of 0 members', () => {
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
	});
});
