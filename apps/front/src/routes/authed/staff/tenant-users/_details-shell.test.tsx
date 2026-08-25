/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLocaleLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	locale: 'en',
	statusPillTone: vi.fn((value: string) =>
		value === 'Active' ? 'success' : 'warning',
	),
	useGlobalTenantUserDetailsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

const labelMap: TestLocaleLabelMap = {
	en: {
		'status-active': 'Active',
		'status-suspended': 'Suspended',
		'globally-suspended': 'Globally suspended',
		'status-unknown': 'Unknown',
	},
	fr: {
		'status-active': 'Actif',
		'status-suspended': 'Suspendu',
		'globally-suspended': 'Suspendu globalement',
		'status-unknown': 'Inconnu',
	},
};

vi.mock('@tanstack/react-router', () => ({
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
		return createElement('a', { href, ...props }, children);
	},
	useBlocker: () => null,
}));

vi.mock('~/components/ui/product-page', () => ({
	StatusPill: ({ children }: { children: ReactNode }) =>
		createElement('span', { 'data-testid': 'status-pill' }, children),
}));

vi.mock('~/components/ui/status-tone', () => ({
	statusPillTone: mocks.statusPillTone,
}));

vi.mock('~/components/ui/person-avatar', () => ({
	PersonAvatar: ({ name }: { name: string }) =>
		createElement('span', { 'data-testid': 'person-avatar' }, name),
}));

vi.mock('~/components/error-views/AppErrorView', () => ({
	AppErrorView: ({ testId, title }: { testId?: string; title?: ReactNode }) =>
		createElement('div', { 'data-testid': testId ?? 'app-error-view' }, title),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }),
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => createElement('div', { 'data-testid': 'forbidden-view' }),
}));

vi.mock('~/components/ui/tabs', () => ({
	Tabs: ({ children }: { children?: ReactNode }) =>
		createElement('div', { 'data-testid': 'tabs-root' }, children),
	TabsList: ({ children }: { children?: ReactNode }) =>
		createElement('div', { 'data-testid': 'tabs-list' }, children),
	TabsTrigger: ({
		children,
		asChild,
	}: {
		children?: ReactNode;
		asChild?: boolean;
	}) =>
		createElement(
			'div',
			{
				'data-testid': 'tabs-trigger',
				'data-as-child': String(asChild ?? false),
			},
			children,
		),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => labelMap[mocks.locale]?.[key] ?? key,
	}),
}));

vi.mock('~/lib/query/staff-global-tenant-users', () => ({
	toGlobalTenantUserDetails: (
		data:
			| {
					id: string;
					email: string;
					firstName: string | null;
					lastName: string | null;
					displayName: string;
					status: string | null;
			  }
			| null
			| undefined,
	) => {
		// Mirror the seam contract: a payload without its required identity
		// normalizes to null (rendered as the empty-payload error state).
		if (!data?.id.trim() || !data.email.trim()) {
			return null;
		}
		return data;
	},
	useGlobalTenantUserDetailsQuery: mocks.useGlobalTenantUserDetailsQuery,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { TenantUserDetailsShell } from './_details-shell';
import { formatGlobalTenantUserStatusLabel } from './_tenant-user-status-label';

const baseUser = {
	id: 'user-1',
	email: 'member@example.com',
	firstName: 'Ada',
	lastName: 'Lovelace',
	displayName: 'Ada Lovelace',
	status: 'Active',
};

beforeEach(() => {
	mocks.shouldLogoutForFailure.mockReturnValue(false);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('global tenant-user details shell', () => {
	test('renders the identity header with avatar and localized status on success', () => {
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: baseUser,
			isPending: false,
			isError: false,
			error: null,
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="user-1" activeTab="general">
				<div data-testid="tab-body" />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('person-avatar').textContent).toBe(
			'Ada Lovelace',
		);
		expect(screen.getByTestId('status-pill').textContent).toBe('Active');
		expect(mocks.statusPillTone).toHaveBeenCalledWith('Active');
		expect(screen.getByText('member@example.com')).toBeTruthy();
		expect(screen.getByTestId('tab-body')).toBeTruthy();
	});

	test('shows the loading state while the details query is pending', () => {
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="user-1" activeTab="general">
				<div />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('tenant-user-details-loading')).toBeTruthy();
		expect(screen.queryByTestId('tab-body')).toBeNull();
	});

	test('renders the not-found view for a 404 problem response', () => {
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: { kind: 'problem', status: 404 },
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="user-1" activeTab="general">
				<div />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('tenant-user-details-not-found')).toBeTruthy();
	});

	test('treats a malformed-id 400 problem as not-found', () => {
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: {
				kind: 'problem',
				status: 400,
				translationKey: 'malformed-id',
			},
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="not-a-guid" activeTab="organizations">
				<div />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('tenant-user-details-not-found')).toBeTruthy();
	});

	test('renders the forbidden view for a 403 problem response without logging out', () => {
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: { kind: 'problem', status: 403 },
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="user-1" activeTab="general">
				<div />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('forbidden-view')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders the generic error view for a 500 problem response', () => {
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: { kind: 'problem', status: 500 },
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="user-1" activeTab="general">
				<div />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('tenant-user-details-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('logs out when the failure demands it', () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: { kind: 'problem', status: 401 },
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="user-1" activeTab="general">
				<div />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('shows the empty-payload view when the DTO cannot be normalized', () => {
		mocks.useGlobalTenantUserDetailsQuery.mockReturnValue({
			data: { id: '', email: '' },
			isPending: false,
			isError: false,
			error: null,
			refetch: vi.fn(),
		});

		render(
			<TenantUserDetailsShell userId="user-1" activeTab="general">
				<div />
			</TenantUserDetailsShell>,
		);

		expect(screen.getByTestId('tenant-user-details-empty')).toBeTruthy();
	});
});

describe('formatGlobalTenantUserStatusLabel', () => {
	test.each([
		['Active', 'status-active'],
		['active', 'status-active'],
		['Suspended', 'status-suspended'],
		['GloballySuspended', 'globally-suspended'],
		['globally_suspended', 'globally-suspended'],
		['mystery', 'status-unknown'],
		[null, 'status-unknown'],
	])('maps %s to %s', (status, expectedKey) => {
		expect(formatGlobalTenantUserStatusLabel(status, (key) => key)).toBe(
			expectedKey,
		);
	});

	test('resolves through the active locale at render time', () => {
		mocks.locale = 'fr';
		expect(formatGlobalTenantUserStatusLabel('Active', (key) => key)).toBe(
			'status-active',
		);
		expect(labelMap.fr['status-active']).toBe('Actif');
	});
});
