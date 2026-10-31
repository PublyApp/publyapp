/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLocaleLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	locale: 'en',
	statusPillTone: vi.fn((value: string | null) =>
		value?.toLowerCase() === 'active' ? 'success' : 'warning',
	),
	navigate: vi.fn(),
	useStaffProfileDetailsQuery: vi.fn(),
	useStaffProfileUsersQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	useStaffTeamOverview: vi.fn(),
	listPageProps: null as Record<string, unknown> | null,
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
		if (status?.toLowerCase() === 'active') {
			key = 'status-active';
		} else if (status?.toLowerCase() === 'suspended') {
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
	selectStaffProfileCrumbName: () => undefined,
	staffProfileCrumbQuery: () => undefined,
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

vi.mock('../../_staff-list-team', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../_staff-list-team')>();
	return {
		...actual,
		useStaffTeamOverview: mocks.useStaffTeamOverview,
	};
});

vi.mock('~/components/list/list-page', () => ({
	ListPage: (props: Record<string, unknown>) => {
		mocks.listPageProps = props;
		return createElement(
			'div',
			{
				'data-testid': props.testId as string,
				'data-count': String(props.count),
			},
			props.newAction as ReactNode,
		);
	},
}));

vi.mock('../../_staff-list-team', () => ({
	useStaffTeamOverview: mocks.useStaffTeamOverview,
	buildStaffTeamPanelGroups: () => [],
}));

import { buildColumns } from './_users-columns';
import { Route } from './users';

const Component = Route.options.component as () => JSX.Element;
const renderPage = () => render(<Component />);
const listPageProps = <K extends string>(key: K) =>
	(mocks.listPageProps as Record<string, unknown> | null)?.[key];

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
		data: { users: [], count: 3 },
		isPending: false,
		isError: false,
		isFetching: false,
		error: null,
		refetch: vi.fn(),
	});
	mocks.useStaffTeamOverview.mockReturnValue({
		counts: { staff: 10, invitations: 10, profiles: 7 },
		staff: [],
		invitations: [],
		profiles: [],
	});
});

describe('staff profile users columns', () => {
	test('has the three designed columns in order', () => {
		const columns = buildColumns((key: string) => key);
		expect(columns.map((column) => column.id)).toEqual([
			'name',
			'email',
			'status',
		]);
		expect(columns.map((column) => column.width)).toEqual([250, 270, 170]);
	});

	test('renders the first column as a link to staff user detail', () => {
		const columns = buildColumns((key: string) =>
			key === 'status-active' ? 'Active' : key,
		);
		const nameCell = columns.find((column) => column.id === 'name');
		const row = {
			id: '333',
			firstName: 'Ada',
			lastName: 'Lovelace',
			email: 'ada@example.com',
			avatarUrl: null,
			status: 'Active' as const,
		};

		render(<>{nameCell?.cell(row)}</>);

		const userLink = screen.getByRole('link', {
			name: /Ada Lovelace/,
		}) as HTMLAnchorElement;
		expect(userLink.getAttribute('href')).toBe('/staff/staff-users/333');
		expect(userLink.querySelector('.publy-record-link')).not.toBeNull();
	});

	test.each([
		['en', 'Active', 'Active'],
		['en', 'Suspended', 'Suspended'],
		['en', null, 'Unknown'],
		['fr', 'Active', 'Actif'],
		['fr', 'Suspended', 'Suspendu'],
		['fr', null, 'Inconnu'],
	])(
		'renders %s status %s as %s in a status pill and applies tone',
		(locale, status, expectedLabel) => {
			mocks.locale = locale;
			const columns = buildColumns(
				(key: string) => labelMap[locale]?.[key] ?? key,
			);
			const statusCell = columns.find((column) => column.id === 'status');
			render(
				<>
					{statusCell?.cell({
						id: '333',
						firstName: 'Ada',
						lastName: 'Lovelace',
						email: 'ada@example.com',
						avatarUrl: null,
						status: status as 'Active' | 'Suspended' | null,
					})}
				</>,
			);

			expect(screen.getByTestId('status-pill').textContent).toBe(expectedLabel);
			expect(mocks.statusPillTone).toHaveBeenCalledWith(status);
		},
	);
});

describe('staff profile users page', () => {
	test('renders the users inset with the API count and the assign action', () => {
		renderPage();

		expect(screen.getByTestId('staff-profile-users-page')).toBeTruthy();
		expect(screen.getByTestId('staff-profile-users-table')).toBeTruthy();
		expect(listPageProps('count')).toBe(3);
		expect(listPageProps('title')).toBe('users');
		expect(listPageProps('defaultColumns')).toEqual([
			'name',
			'email',
			'status',
		]);
		expect(
			screen.getByRole('link', { name: /assign-staff-members/ }),
		).toBeTruthy();
	});

	test('keeps the bounded detail-tab chain', () => {
		renderPage();

		const tabsContent = screen
			.getByTestId('staff-profile-users-table')
			.closest('.publy-detail-tab-body');
		expect(tabsContent).not.toBeNull();
		expect(tabsContent?.className).toContain('min-h-0');
		const tabsRoot = tabsContent?.closest('[data-slot="tabs"]');
		expect(tabsRoot?.className).toContain('min-h-0');
		expect(tabsRoot?.className).toContain('flex-1');
	});
});
