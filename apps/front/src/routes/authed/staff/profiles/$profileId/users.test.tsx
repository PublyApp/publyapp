/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLocaleLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	locale: 'en',
	statusPillTone: vi.fn((value: string | null) =>
		value === 'active' ? 'success' : 'warning',
	),
	navigate: vi.fn(),
	useStaffProfileDetailsQuery: vi.fn(),
	useStaffProfileUsersQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

const labelMap: TestLocaleLabelMap = {
	en: {
		'status-active': 'Active',
		'status-suspended': 'Suspended',
		'status-unknown': 'Unknown',
	},
	fr: {
		'status-active': 'Actif',
		'status-suspended': 'Suspendu',
		'status-unknown': 'Inconnu',
	},
};

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useParams: () => ({ profileId: 'profile-1' }),
		useSearch: () => ({}),
		useNavigate: () => mocks.navigate,
	}),
	Link: ({
		children,
		href,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		href?: string;
		to?: string;
		params?: Record<string, string>;
		target?: string;
	}) => {
		let targetHref = href ?? to ?? '';
		if (params && targetHref) {
			for (const [key, value] of Object.entries(params)) {
				targetHref = targetHref.replace(`$${key}`, value);
			}
		}

		return createElement('a', { href: targetHref, ...props }, children);
	},
}));

vi.mock('~/components/ui/product-page', () => ({
	StatusPill: ({ children }: { children: ReactNode }) =>
		createElement('span', { 'data-testid': 'status-pill' }, children),
}));

vi.mock('~/components/ui/status-tone', () => ({
	statusPillTone: mocks.statusPillTone,
}));

vi.mock('../../staff-users/status-labels', () => ({
	formatStaffStatusLabel: (
		status: string | null,
		t: (key: string) => string,
	) => {
		let key = 'status-unknown';
		if (status === 'active') {
			key = 'status-active';
		} else if (status === 'suspended') {
			key = 'status-suspended';
		}

		return t(key);
	},
}));

vi.mock('~/components/ui/person-avatar', () => ({
	PersonAvatar: ({ name }: { name: string }) =>
		createElement('span', { 'data-testid': 'initials' }, name),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => labelMap[mocks.locale]?.[key] ?? key,
	}),
}));

vi.mock('~/lib/query/staff-profile-users', () => ({
	toStaffProfileUserRows: (rows: unknown[] | null | undefined) => rows ?? [],
	useStaffProfileUsersQuery: mocks.useStaffProfileUsersQuery,
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	toStaffProfileDetails: (
		data: { id: string; name: string; userAccountCount: number } | undefined,
	) => data ?? null,
	useStaffProfileDetailsQuery: mocks.useStaffProfileDetailsQuery,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/components/error-views/AppErrorView', () => ({
	AppErrorView: ({ testId }: { testId?: string }) =>
		createElement('div', { 'data-testid': testId ?? 'app-error-view' }),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }),
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => createElement('div', { 'data-testid': 'forbidden-view' }),
}));

vi.mock('~/components/ui/button', () => ({
	Button: ({ children, ...props }: { children?: ReactNode }) =>
		createElement('button', props, children),
	buttonVariants: () => '',
}));

vi.mock('~/components/table/data-table', () => ({
	DataTable: ({ testId }: { testId?: string }) =>
		createElement('div', { 'data-testid': testId ?? 'data-table' }),
}));

import { buildColumns } from './_users-columns';
import { Route } from './users';

const Component = Route.options.component as () => JSX.Element;

const renderPage = () => render(<Component />);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	mocks.shouldLogoutForFailure.mockReturnValue(false);
	mocks.useStaffProfileDetailsQuery.mockReturnValue({
		data: {
			id: 'profile-1',
			name: 'Billing',
			userAccountCount: 3,
		},
		isPending: false,
		isError: false,
		error: null,
		refetch: vi.fn(),
	});
	mocks.useStaffProfileUsersQuery.mockReturnValue({
		data: { users: [], count: 0 },
		isPending: false,
		isError: false,
		isFetching: false,
		error: null,
		refetch: vi.fn(),
	});
});

describe('staff profile users columns', () => {
	test('applies a fixed width to every column except the fluid name column', () => {
		const columns = buildColumns((key: string) => key);
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			name: undefined,
			status: '122px',
		});
	});

	test('renders the first column as a link to staff user detail', () => {
		const columns = buildColumns((key: string) =>
			key === 'status-active' ? 'Active' : key,
		);
		const nameCell = columns.find((column) => column.id === 'name');
		const row = {
			original: {
				id: '333',
				firstName: 'Ada',
				lastName: 'Lovelace',
				email: 'ada@example.com',
				avatarUrl: null,
				status: 'active',
			},
		};
		const cellRenderer = nameCell?.cell as (props: {
			row: typeof row;
		}) => JSX.Element;

		render(<>{cellRenderer({ row })}</>);

		const userLink = screen.getByRole('link', {
			name: /Ada Lovelace/,
		}) as HTMLAnchorElement;
		expect(userLink.getAttribute('href')).toBe('/staff/staff-users/333');
		expect(userLink.className.includes('publy-record-link')).toBe(true);
	});

	test.each([
		['en', 'active', 'Active'],
		['en', 'suspended', 'Suspended'],
		['en', null, 'Unknown'],
		['fr', 'active', 'Actif'],
		['fr', 'suspended', 'Suspendu'],
		['fr', null, 'Inconnu'],
	])(
		'renders %s status %s as %s in a status pill and applies tone',
		(locale, status, expectedLabel) => {
			mocks.locale = locale;

			const columns = buildColumns(
				(key: string) => labelMap[locale]?.[key] ?? key,
			);
			const statusCell = columns.find((column) => column.id === 'status');
			const renderCell = statusCell?.cell as (props: {
				getValue: () => string | null;
			}) => JSX.Element;

			render(<>{renderCell({ getValue: () => status })}</>);

			expect(screen.getByTestId('status-pill').textContent).toBe(expectedLabel);
			expect(mocks.statusPillTone).toHaveBeenCalledWith(status);
		},
	);
});

describe('staff profile users columns — locale fallbacks', () => {
	test('uses status-unknown when the backend status is missing', () => {
		const columns = buildColumns((key: string) => key);
		const statusCell = columns.find((column) => column.id === 'status');
		const renderCell = statusCell?.cell as (props: {
			getValue: () => string | null;
		}) => JSX.Element;

		render(<>{renderCell({ getValue: () => 'mystery' })}</>);

		expect(screen.getByTestId('status-pill').textContent).toBe(
			'status-unknown',
		);
	});
});

// users-auth-r1-F5: this route requests 100 rows by default but had no
// bounded-height chain, so the table expanded `.app-shell-main` and scrolled
// the whole app shell instead of just the table body
// (conventions.md:237-247). This asserts the complete chain, not merely that
// the table renders — a regression that restores just the outer div would
// still fail this.
describe('staff profile users page — contained scroll layout', () => {
	test('gives the route a bounded h-full/min-h-0 flex column down to the DataTable', () => {
		renderPage();

		const root = screen.getByTestId('staff-profile-users-page');
		expect(root.className).toContain('flex');
		expect(root.className).toContain('h-full');
		expect(root.className).toContain('min-h-0');
		expect(root.className).toContain('flex-col');

		const table = screen.getByTestId('staff-profile-users-table');

		const tabsContent = table.closest('.publy-detail-tab-body');
		expect(tabsContent).not.toBeNull();
		expect(tabsContent?.className).toContain('min-h-0');

		const tabsRoot = tabsContent?.closest('[data-slot="tabs"]');
		expect(tabsRoot).not.toBeNull();
		expect(tabsRoot?.className).toContain('min-h-0');
		expect(tabsRoot?.className).toContain('flex-1');
	});

	// #978: DataTable already renders its own `.publy-table-card` surface —
	// wrapping it in a `Card` produces two concentric rounded surfaces. This
	// route must render the table directly on the tab body, matching the
	// convention on staff/tenants.tsx and its siblings.
	test('#978: renders the table directly on the tab body, with no wrapping Card', () => {
		renderPage();

		const table = screen.getByTestId('staff-profile-users-table');
		expect(table.closest('[data-slot="card"]')).toBeNull();
	});
});
