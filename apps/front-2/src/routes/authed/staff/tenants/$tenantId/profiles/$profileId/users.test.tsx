/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: {} as Record<string, unknown>,
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantProfileDetailsQuery: vi.fn(),
	toStaffTenantProfileDetails: vi.fn(),
	useStaffTenantProfileMembersQuery: vi.fn(),
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
		children: ReactNode;
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
	level: 'Level',
	status: 'Status',
	admin: 'Admin',
	user: 'User',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-globally-suspended': 'Globally suspended',
	'profile-sections': 'Profile sections',
	'assign-members': 'Assign members',
	'profile-members-tab-description':
		'People currently assigned to this profile.',
	'profile-members-table-aria-label': 'Profile members',
	'profile-members-empty-title': 'No members assigned yet',
	'profile-members-empty-description':
		'Use "Assign members" to add people to this profile.',
	'tenant-users-no-match-title': 'No members match your search',
	'tenant-users-no-match-description':
		'Try a different name, email, or filter.',
	'search-tenant-members': 'Search members by name or email…',
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

vi.mock('~/components/table/data-table', () => ({
	DataTable: ({ testId }: { testId?: string }) => (
		<div data-testid={testId ?? 'data-table'} />
	),
}));

vi.mock('~/components/ui/initials-avatar', () => ({
	InitialsAvatar: ({ name }: { name: string }) => (
		<span aria-hidden="true" data-testid="initials" data-name={name} />
	),
	BrandTile: ({ name }: { name: string }) => (
		<span aria-hidden="true" data-testid="brand-tile" data-name={name} />
	),
}));

vi.mock('~/components/ui/product-page', () => ({
	StatusPill: ({ children }: { children: ReactNode }) => (
		<span data-testid="status-pill">{children}</span>
	),
}));

vi.mock('~/components/ui/status-tone', () => ({
	statusPillTone: (value: string | null) =>
		value === 'Active' ? 'success' : 'warning',
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
}));

type MemberFixture = {
	id?: string;
	email?: string;
	firstName?: string | null;
	lastName?: string | null;
	status?: string | null;
	level?: string | null;
};

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useStaffTenantProfileDetailsQuery: mocks.useStaffTenantProfileDetailsQuery,
	toStaffTenantProfileDetails: mocks.toStaffTenantProfileDetails,
	useStaffTenantProfileMembersQuery: mocks.useStaffTenantProfileMembersQuery,
	toStaffTenantProfileMemberRows: (items: MemberFixture[] | null | undefined) =>
		(items ?? []).map((item) => ({
			id: item.id ?? '',
			email: item.email ?? '',
			firstName: item.firstName ?? null,
			lastName: item.lastName ?? null,
			avatarUrl: null,
			status: item.status ?? null,
			level: item.level ?? null,
			displayName:
				[item.firstName, item.lastName].filter(Boolean).join(' ') ||
				item.email ||
				'',
		})),
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

import {
	makeProfileMemberColumns,
	parseProfileMembersSearchParams,
	serializeProfileMembersSearchParams,
	Route,
} from './users';

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
	mocks.useStaffTenantProfileMembersQuery.mockReturnValue({
		data: { users: [], count: 0 },
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
});

describe('parseProfileMembersSearchParams', () => {
	test('round-trips the assign flag as the number 1 alongside table state', () => {
		expect(parseProfileMembersSearchParams({ assign: 1 })).toEqual({
			q: undefined,
			sortId: undefined,
			sortOrder: undefined,
			cursor: undefined,
			size: undefined,
			assign: 1,
		});
		expect(parseProfileMembersSearchParams({ assign: '1' }).assign).toBe(1);
		expect(parseProfileMembersSearchParams({}).assign).toBeUndefined();
		expect(
			parseProfileMembersSearchParams({ assign: 'nonsense' }).assign,
		).toBeUndefined();
	});

	test('parses table state alongside the assign flag', () => {
		expect(
			parseProfileMembersSearchParams({
				q: 'ada',
				sort_id: 'email',
				sort_order: 'asc',
				size: 50,
				assign: 1,
			}),
		).toEqual({
			q: 'ada',
			sortId: 'email',
			sortOrder: 'asc',
			cursor: undefined,
			size: 50,
			assign: 1,
		});
	});
});

describe('serializeProfileMembersSearchParams', () => {
	test('serializes table state to snake_case and keeps the assign flag as a number', () => {
		expect(
			serializeProfileMembersSearchParams({
				q: 'ada',
				sortId: 'email',
				sortOrder: 'asc',
				size: 50,
				assign: 1,
			}),
		).toEqual({
			q: 'ada',
			sort_id: 'email',
			sort_order: 'asc',
			size: '50',
			assign: 1,
		});
	});

	test('omits the assign key when undefined', () => {
		expect(serializeProfileMembersSearchParams({ assign: undefined })).toEqual({
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

	test('renders a real members roster table instead of the removed placeholder', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-table'),
		).toBeTruthy();
		expect(
			screen.queryByTestId('staff-tenant-profile-members-list-unavailable'),
		).toBeNull();
	});

	test('fetches members scoped to the tenant and profile once the profile is loaded', () => {
		renderPage();

		expect(mocks.useStaffTenantProfileMembersQuery).toHaveBeenCalled();
		const [variables, options] =
			mocks.useStaffTenantProfileMembersQuery.mock.calls[0];
		expect(variables).toMatchObject({
			tenantId: '11111111-1111-1111-1111-111111111111',
			profileId: '22222222-2222-2222-2222-222222222222',
		});
		expect(options?.enabled).toBe(true);
	});

	test('opens the assign-members drawer via the URL-backed ?assign=1 flag', () => {
		renderPage();

		expect(mocks.drawerIsOpen).toBe(false);

		fireEvent.click(screen.getByText('Assign members'));

		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		const call = mocks.navigate.mock.calls[0]?.[0] as {
			search: (previous: { assign?: 1 }) => Record<string, unknown>;
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

describe('makeProfileMemberColumns', () => {
	const TENANT_ID = '11111111-1111-1111-1111-111111111111';

	test('renders the first column as a link to the tenant user detail page', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
		);
		const nameColumn = columns.find((column) => column.id === 'name');
		const row = {
			original: {
				id: 'user-account-1',
				email: 'ada@example.com',
				firstName: 'Ada',
				lastName: 'Lovelace',
				avatarUrl: null,
				status: 'Active',
				level: 'Admin',
				displayName: 'Ada Lovelace',
			},
		};
		const cellRenderer = nameColumn?.cell as (props: {
			row: typeof row;
		}) => JSX.Element;

		render(<>{cellRenderer({ row })}</>);

		const userLink = screen.getByRole('link', {
			name: /Ada Lovelace/,
		}) as HTMLAnchorElement;
		expect(userLink.getAttribute('href')).toBe(
			`/staff/tenants/${TENANT_ID}/users/user-account-1`,
		);
		expect(screen.getByText('Ada Lovelace').className).toContain(
			'publy-record-link',
		);
	});

	test('renders the level chip using the shared level formatter', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
		);
		const levelColumn = columns.find((column) => column.id === 'level');
		const cellRenderer = levelColumn?.cell as (props: {
			getValue: () => string | null;
		}) => JSX.Element;

		render(<>{cellRenderer({ getValue: () => 'Admin' })}</>);

		expect(screen.getByText('Admin')).toBeTruthy();
	});

	test('renders the status pill using the shared status formatter and tone', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
		);
		const statusColumn = columns.find((column) => column.id === 'status');
		const cellRenderer = statusColumn?.cell as (props: {
			getValue: () => string | null;
		}) => JSX.Element;

		render(<>{cellRenderer({ getValue: () => 'Active' })}</>);

		expect(screen.getByTestId('status-pill').textContent).toBe('Active');
	});
});
