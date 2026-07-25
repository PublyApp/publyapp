/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	locale: 'en',
	statusPillTone: vi.fn((value: string | null) =>
		value === 'active' ? 'success' : 'warning',
	),
	navigate: vi.fn(),
	useStaffProfileDetailsQuery: vi.fn(),
	useStaffProfileUsersQuery: vi.fn(),
	invalidateQueries: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	search: {} as Record<string, unknown>,
}));

const labelMap: Record<string, Record<string, string>> = {
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
		useParams: () => ({ profileId: 'profile-1' }),
		useSearch: () => mocks.search,
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

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('~/lib/query/staff-profile-users', () => ({
	getStaffProfileUsersQueryKey: (variables: Record<string, unknown>) => [
		'staff-profile-users',
		variables,
	],
	toStaffProfileUserRows: (rows: unknown[] | null | undefined) => rows ?? [],
	useStaffProfileUsersQuery: mocks.useStaffProfileUsersQuery,
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	toStaffProfileDetails: (
		data: { id: string; name: string; userAccountCount: number } | undefined,
	) => data ?? null,
	useStaffProfileDetailsQuery: mocks.useStaffProfileDetailsQuery,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
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
	DataTable: ({
		testId,
		pageIndex = 0,
		rows = [],
		hasPreviousPage,
		hasNextPage,
		onPreviousPage,
		onNextPage,
	}: {
		testId?: string;
		pageIndex?: number;
		rows?: Array<{ email: string }>;
		hasPreviousPage?: boolean;
		hasNextPage?: boolean;
		onPreviousPage?: () => void;
		onNextPage?: () => void;
	}) =>
		createElement(
			'div',
			{ 'data-testid': testId ?? 'data-table' },
			createElement('span', null, `Page ${pageIndex + 1}`),
			...rows.map((row) =>
				createElement('span', { key: row.email }, row.email),
			),
			createElement(
				'button',
				{
					disabled: !hasPreviousPage,
					onClick: onPreviousPage,
					type: 'button',
				},
				'Previous',
			),
			createElement(
				'button',
				{
					disabled: !hasNextPage,
					onClick: onNextPage,
					type: 'button',
				},
				'Next',
			),
		),
}));

import { buildColumns, Route } from './users';

const Component = (
	Route as unknown as {
		component: () => JSX.Element;
	}
).component;

const renderPage = () => render(<Component />);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.search = {};
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
// the table renders — a regression that restores just the outer div (or
// just the Card) without the rest would still fail this.
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

		const card = table.closest('[data-slot="card"]');
		expect(card).not.toBeNull();
		expect(card?.className).toContain('min-h-0');
		expect(card?.className).toContain('flex-1');

		const tabsRoot = tabsContent?.closest('[data-slot="tabs"]');
		expect(tabsRoot).not.toBeNull();
		expect(tabsRoot?.className).toContain('min-h-0');
		expect(tabsRoot?.className).toContain('flex-1');
	});
});

describe('staff profile users page — offset pagination', () => {
	test('keeps page 2 selected while its slow 25-user response is pending and can navigate back', async () => {
		mocks.search = { size: 10 };
		let pageTwoResolved = false;
		const requestedPages: number[] = [];
		mocks.useStaffProfileUsersQuery.mockImplementation(
			({ pageIndex = 0 }: { pageIndex?: number }) => {
				requestedPages.push(pageIndex + 1);

				if (pageIndex === 1 && !pageTwoResolved) {
					return {
						data: undefined,
						isPending: true,
						isError: false,
						isFetching: true,
						error: null,
						refetch: vi.fn(),
					};
				}

				return {
					data: { users: [], count: 25 },
					isPending: false,
					isError: false,
					isFetching: false,
					error: null,
					refetch: vi.fn(),
				};
			},
		);

		const view = renderPage();

		expect(screen.getByText('Page 1')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Next' }));

		await waitFor(() => expect(requestedPages).toContain(2));
		expect(screen.getByText('Page 2')).toBeTruthy();

		pageTwoResolved = true;
		view.rerender(<Component />);

		expect(screen.getByText('Page 2')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

		expect(screen.getByText('Page 1')).toBeTruthy();
		expect(requestedPages).toContain(1);
	});

	test('revalidates a cached clamp destination before showing its rows after the count shrinks', async () => {
		mocks.search = { size: 10 };
		let pageTwoRevalidated = false;
		mocks.invalidateQueries.mockImplementation(async () => {
			pageTwoRevalidated = true;
		});
		mocks.useStaffProfileUsersQuery.mockImplementation(
			({ pageIndex = 0 }: { pageIndex?: number }) => {
				const count = pageIndex === 2 ? 15 : 25;
				let length = 10;
				if (pageIndex === 1 && pageTwoRevalidated) {
					length = 5;
				} else if (pageIndex === 2) {
					length = 0;
				}
				const users = Array.from({ length }, (_, index) => ({
					email: `boundary-${pageIndex + 1}-${index}@example.test`,
				}));

				return {
					data: { users, count },
					isPending: false,
					isError: false,
					isFetching: false,
					error: null,
					refetch: vi.fn(),
				};
			},
		);

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(screen.getByText('boundary-2-9@example.test')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Next' }));

		await waitFor(() => {
			expect(screen.getByText('Page 2')).toBeTruthy();
			expect(screen.queryByText('boundary-2-9@example.test')).toBeNull();
			expect(screen.getByText('boundary-2-4@example.test')).toBeTruthy();
		});
		expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({
			exact: true,
			queryKey: [
				'staff-profile-users',
				expect.objectContaining({ pageIndex: 1, size: 10 }),
			],
			refetchType: 'all',
		});
	});
});
