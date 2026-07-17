/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: {} as Record<string, unknown>,
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantProfileDetailsQuery: vi.fn(),
	toStaffTenantProfileDetails: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
	drawerIsOpen: false,
	drawerOnOpenChange: (_isOpen: boolean) => {},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
			profileId: '22222222-2222-2222-2222-222222222222',
		}),
		useSearch: () => mocks.search,
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

const TRANSLATIONS: Record<string, string> = {
	profile: 'Profile',
	members: 'Members',
	'profile-sections': 'Profile sections',
	'assign-members': 'Assign members',
	'profile-members-tab-description':
		'People currently assigned to this profile.',
	'profile-member-list-unavailable-title': "Member list isn't available yet",
	'profile-member-list-unavailable-description':
		'We can show how many members this profile has, but the detailed roster is not available from the API yet.',
	'no-description-provided': 'No description provided.',
	'loading-tenant-profile': 'Loading tenant profile…',
	'error-500-code': '500 — Server Error',
	'error-404-code': '404 — Not Found',
	'tenant-profile-not-found-title': 'Tenant profile not found',
	'tenant-profile-not-found-description':
		'This tenant profile could not be found.',
	'tenant-profile-payload-empty': 'The tenant profile payload was empty.',
	'unable-to-load-tenant-profile': 'Unable to load this tenant profile',
	'tenant-profile-load-error-description':
		'There was a problem loading this tenant profile.',
	'tenant-details-error-title': 'Unable to load this tenant',
	'tenant-response-incomplete': 'The tenant response was incomplete.',
	'back-to-tenants': 'Back to tenants',
	'try-again': 'Try again',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = TRANSLATIONS[key] ?? key;
			if (!options) {
				return text;
			}
			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
		i18n: { language: 'en' },
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useStaffTenantProfileDetailsQuery: mocks.useStaffTenantProfileDetailsQuery,
	toStaffTenantProfileDetails: mocks.toStaffTenantProfileDetails,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('./_assign-members-drawer', () => ({
	AssignMembersDrawer: ({
		isOpen,
		onOpenChange,
	}: {
		isOpen: boolean;
		onOpenChange: (isOpen: boolean) => void;
	}) => {
		mocks.drawerIsOpen = isOpen;
		mocks.drawerOnOpenChange = onOpenChange;
		return isOpen ? <div data-testid="assign-drawer-open" /> : null;
	},
}));

import { parseProfileMembersSearchParams, Route } from './users';

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

const TENANT = {
	id: '11111111-1111-1111-1111-111111111111',
	name: 'Acme Corporation',
	code: 'ACME',
	status: 'Active',
	logoUrl: null,
	usersCount: 12,
	ownersCount: 1,
	createdAt: new Date('2026-01-01T00:00:00Z'),
};

const PROFILE = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Approvers',
	description: 'Can review approvals',
	isDefault: false,
	userAccountCount: 4,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.search = {};
	mocks.useStaffTenantDetailsQuery.mockReturnValue({
		data: TENANT,
		isPending: false,
		isError: false,
		refetch: vi.fn(),
	});
	mocks.toStaffTenantDetails.mockReturnValue(TENANT);
	mocks.useStaffTenantProfileDetailsQuery.mockReturnValue({
		data: PROFILE,
		isPending: false,
		isError: false,
		refetch: vi.fn(),
	});
	mocks.toStaffTenantProfileDetails.mockReturnValue(PROFILE);
});

afterEach(() => {
	cleanup();
});

describe('parseProfileMembersSearchParams', () => {
	test('round-trips the assign flag as the number 1', () => {
		expect(parseProfileMembersSearchParams({ assign: 1 })).toEqual({
			assign: 1,
		});
		expect(parseProfileMembersSearchParams({ assign: '1' })).toEqual({
			assign: 1,
		});
		expect(parseProfileMembersSearchParams({})).toEqual({
			assign: undefined,
		});
		expect(parseProfileMembersSearchParams({ assign: 'nonsense' })).toEqual({
			assign: undefined,
		});
	});
});

describe('StaffTenantProfileMembersPage', () => {
	test('renders the profile identity, member count, and tabs', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-page'),
		).toBeTruthy();
		expect(screen.getByText('Approvers')).toBeTruthy();
		expect(screen.getByText('Can review approvals')).toBeTruthy();
		expect(screen.getAllByText('4').length).toBeGreaterThan(0);
		expect(screen.getByText('Profile', { selector: 'a' })).toBeTruthy();
	});

	test('shows the honest "list unavailable" state instead of a fabricated member table', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-list-unavailable'),
		).toBeTruthy();
		expect(screen.getByText("Member list isn't available yet")).toBeTruthy();
	});

	test('opens the assign-members drawer via the URL-backed ?assign=1 flag', () => {
		renderPage();

		expect(mocks.drawerIsOpen).toBe(false);

		fireEvent.click(screen.getByText('Assign members'));

		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		const call = mocks.navigate.mock.calls[0]?.[0] as {
			search: (previous: { assign?: 1 }) => { assign?: 1 };
			replace: boolean;
		};
		expect(call.search({})).toEqual({ assign: 1 });
		expect(call.replace).toBe(true);
	});

	test('renders the drawer open when the URL already carries ?assign=1', () => {
		mocks.search = { assign: 1 };
		renderPage();

		expect(mocks.drawerIsOpen).toBe(true);
		expect(screen.getByTestId('assign-drawer-open')).toBeTruthy();
	});

	test('renders the loading state while the tenant query is pending', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: true,
			isError: false,
			refetch: vi.fn(),
		});

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-loading')).toBeTruthy();
	});

	test('renders the not-found view when the profile payload is empty', () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue(null);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-not-found'),
		).toBeTruthy();
	});

	test('redirects to logout when the tenant query fails with a session error', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: new Error('session expired'),
			refetch: vi.fn(),
		});
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
