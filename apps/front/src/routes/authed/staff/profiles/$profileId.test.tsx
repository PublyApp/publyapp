/**
 * @vitest-environment jsdom
 */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffProfileDetailsQuery: vi.fn(),
	useStaffProfilePermissionKeysQuery: vi.fn(),
	useStaffPermissionCatalogQuery: vi.fn(),
	useStaffProfileUsersQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn((..._args: unknown[]) => false),
	navigate: vi.fn(),
	search: {},
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as (() => boolean) | undefined,
	drawerProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useParams: () => ({
			profileId: '11111111-1111-1111-1111-111111111111',
		}),
		useNavigate: () => mocks.navigate,
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
	useBlocker: (opts: {
		enableBeforeUnload?: boolean;
		shouldBlockFn: () => boolean;
	}) => {
		mocks.capturedShouldBlockFn = opts.shouldBlockFn;
		return mocks.blockerResolver;
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

// #819: the drawer itself has its own suite — here it is a recording stub so
// these tests prove the PAGE wires it up (open flag from ?edit=1, profile,
// save/close callbacks).
vi.mock('./$profileId/_profile-edit-details-drawer', () => ({
	StaffProfileEditDetailsDrawer: (props: Record<string, unknown>) => {
		mocks.drawerProps = props;

		return (
			<div data-testid="staff-profile-edit-details-drawer-stub">
				{props.isOpen ? 'drawer-open' : 'drawer-closed'}
			</div>
		);
	},
}));

vi.mock('~/components/ui/confirm-dialog', () => ({
	ConfirmDialog: ({
		isOpen,
		title,
		onConfirm,
	}: {
		isOpen: boolean;
		title?: string;
		onConfirm?: () => void;
	}) =>
		isOpen ? (
			<div data-testid="confirm-dialog" role="alertdialog">
				{title}
				<button type="button" onClick={onConfirm}>
					leave-page
				</button>
			</div>
		) : null,
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

// #819 — the detail page hosts the edit drawer behind `?edit=1`, with an
// Edit button in the identity header and a nav guard over a dirty draft.
describe('staff profile details route — edit drawer (#819)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.search = {};
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
		mocks.drawerProps = undefined;
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

	test('renders an Edit button in the identity header that opens the drawer via ?edit=1', async () => {
		renderPage();

		fireEvent.click(
			screen.getByRole('button', { name: 'edit-profile-aria-label' }),
		);

		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		const [options] = mocks.navigate.mock.calls[0] as [
			{
				search: (previous: Record<string, unknown>) => Record<string, unknown>;
			},
		];
		expect(options.search({})).toEqual({ edit: 1 });
	});

	test('opens the drawer when ?edit=1 is set, feeding it the loaded profile', () => {
		mocks.search = { edit: 1 };

		renderPage();

		expect(mocks.drawerProps).toBeTruthy();
		expect(mocks.drawerProps?.isOpen).toBe(true);
		expect(mocks.drawerProps?.profile).toEqual({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Platform admin',
			description: 'Full access',
			userAccountCount: 2,
			icon: 'shield-check',
			iconTone: '5',
		});
		expect(
			screen.getByTestId('staff-profile-edit-details-drawer-stub').textContent,
		).toBe('drawer-open');
	});

	test('keeps the drawer closed without ?edit=1', () => {
		renderPage();

		expect(mocks.drawerProps?.isOpen).toBe(false);
		expect(
			screen.getByTestId('staff-profile-edit-details-drawer-stub').textContent,
		).toBe('drawer-closed');
	});

	test('closing the drawer drops ?edit from the URL and preserves other search keys', () => {
		mocks.search = { edit: 1 };
		renderPage();

		const onOpenChange = mocks.drawerProps?.onOpenChange as (
			isOpen: boolean,
		) => void;
		onOpenChange(false);

		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		const [options] = mocks.navigate.mock.calls[0] as [
			{
				search: (previous: Record<string, unknown>) => Record<string, unknown>;
			},
		];
		const nextSearch = options.search({ q: 'x', edit: 1 });
		expect(nextSearch.edit).toBeUndefined();
		expect(nextSearch.q).toBe('x');
	});

	test('a successful save closes the drawer via the same URL flag', () => {
		mocks.search = { edit: 1 };
		renderPage();

		const onSaved = mocks.drawerProps?.onSaved as (profileId: string) => void;
		onSaved('11111111-1111-1111-1111-111111111111');

		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		const [options] = mocks.navigate.mock.calls[0] as [
			{
				search: (previous: Record<string, unknown>) => Record<string, unknown>;
			},
		];
		expect(options.search({ edit: 1 }).edit).toBeUndefined();
	});

	test('the session-expiry callback redirects to logout', () => {
		mocks.search = { edit: 1 };
		renderPage();

		const onSessionExpired = mocks.drawerProps?.onSessionExpired as () => void;
		act(() => {
			onSessionExpired();
		});

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('the nav guard blocks only while the open drawer reports a dirty draft', () => {
		mocks.search = { edit: 1 };
		renderPage();

		// Clean draft: never blocks.
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		// Dirty report from the drawer while open: blocks.
		const onDirtyChange = mocks.drawerProps?.onDirtyChange as (
			isDirty: boolean,
		) => void;
		act(() => {
			onDirtyChange(true);
		});
		expect(mocks.capturedShouldBlockFn?.()).toBe(true);

		// App-initiated close bypasses its own transition...
		const onOpenChange = mocks.drawerProps?.onOpenChange as
			| ((isOpen: boolean) => void)
			| undefined;
		act(() => {
			onDirtyChange(false);
			onOpenChange?.(false);
		});
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);

		// ...and a stale dirty flag after close must not re-arm it.
		act(() => {
			onDirtyChange(true);
		});
		expect(mocks.capturedShouldBlockFn?.()).toBe(false);
	});

	test('shows the unsaved-changes dialog when blocked, and Leave page proceeds', () => {
		mocks.search = { edit: 1 };
		mocks.blockerResolver.status = 'blocked';
		mocks.blockerResolver.proceed = vi.fn();
		renderPage();

		expect(screen.getByTestId('confirm-dialog')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'leave-page' }));
		expect(mocks.blockerResolver.proceed).toHaveBeenCalled();
	});
});
