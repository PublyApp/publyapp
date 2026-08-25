import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	onOpenSuspendDialog: vi.fn(),
	onOpenDeleteDialog: vi.fn(),
	onRetryProfiles: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
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

const I18N_LABELS: TestLabelMap = {
	'contact-details': 'Contact details',
	name: 'Name',
	email: 'Email',
	'no-email-address': 'No email address',
	role: 'Role',
	status: 'Status',
	unknown: 'Unknown',
	admin: 'Admin',
	user: 'User',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-unknown': 'Unknown',
	created: 'Created',
	updated: 'Updated',
	'assigned-profiles-and-roles': 'Assigned profiles & roles',
	'no-profiles-assigned': 'No profiles are currently assigned.',
	'no-description-provided': 'No description provided.',
	'profile-summary': 'Profile summary',
	account: 'Account',
	'user-id': 'User ID',
	'unable-to-load-assigned-profiles': 'Unable to load assigned profiles.',
	'danger-zone': 'Danger zone',
	'suspend-or-reactivate': 'Suspend or reactivate',
	'confirm-delete-staff-user-title': 'Delete staff member',
	'confirm-delete-staff-user-message':
		'Are you sure you want to delete this staff member? This action cannot be easily undone.',
	delete: 'Delete',
	suspend: 'Suspend',
	reactivate: 'Reactivate',
	'common-loading': 'Loading...',
	'loading-assigned-profiles': 'Loading assigned profiles…',
	'try-again': 'Try again',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const resolvedKey = key.replace(/^common:/, '');
			const count = typeof options?.count === 'number' ? options.count : 0;
			const max = typeof options?.max === 'number' ? options.max : 0;

			if (resolvedKey === 'assigned-count') {
				return `${count} assigned`;
			}

			if (resolvedKey === 'count-of-max') {
				return `${count} of ${max}`;
			}

			return I18N_LABELS[resolvedKey] ?? resolvedKey;
		},
	}),
}));

vi.mock('~/lib/format-date-time', () => ({
	formatDateTime: (value: Date | null | undefined, locale: string): string => {
		if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
			return '—';
		}

		return value.toLocaleString(locale, {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	},
}));

import { StaffUserOverviewContext } from './_overview-context';
import type { StaffUserOverviewContextValue } from './_overview-context';
import { Route } from './index';

const baseUser = {
	id: '11111111-1111-1111-1111-111111111111',
	email: 'owner@publyapp.local',
	firstName: 'Owner',
	lastName: 'User',
	avatarUrl: null,
	accountLevel: 'Admin',
	status: 'Active',
	createdAt: new Date('2026-07-01T09:00:00Z'),
	updatedAt: new Date('2026-07-02T10:00:00Z'),
	displayName: 'Owner User',
};

const buildContextValue = (
	overrides: Partial<StaffUserOverviewContextValue> = {},
): StaffUserOverviewContextValue => ({
	user: baseUser,
	locale: 'en',
	profiles: [
		{ id: 'profile-1', name: 'Platform admin', description: 'Full access' },
		{ id: 'profile-2', name: 'Support staff', description: null },
	],
	profilesIsPending: false,
	profilesHasError: false,
	onRetryProfiles: mocks.onRetryProfiles,
	maxProfilesPerUser: 5,
	canSuspend: true,
	canReactivate: false,
	suspendLabelKey: 'suspend' as const,
	suspendDescription: 'Suspending this user revokes access.',
	isDeletePending: false,
	onOpenSuspendDialog: mocks.onOpenSuspendDialog,
	onOpenDeleteDialog: mocks.onOpenDeleteDialog,
	...overrides,
});

const renderTab = (
	contextValue: StaffUserOverviewContextValue = buildContextValue(),
) => {
	const Component = Route.options.component as () => JSX.Element;

	return render(
		<StaffUserOverviewContext.Provider value={contextValue}>
			<Component />
		</StaffUserOverviewContext.Provider>,
	);
};

describe('staff user overview tab', () => {
	test('declares the staff-users i18n namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual(['staff-users']);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	test('renders contact details, assigned profiles, account, and danger zone cards', () => {
		renderTab();

		expect(screen.getByText('Contact details')).toBeTruthy();
		expect(screen.getByText('Assigned profiles & roles')).toBeTruthy();
		expect(screen.getByText('2 assigned')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Platform admin' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Support staff' })).toBeTruthy();
		expect(screen.getByText('Full access')).toBeTruthy();
		expect(screen.getByText('No description provided.')).toBeTruthy();
		expect(screen.getByText('Profile summary')).toBeTruthy();

		expect(screen.getByText('Account')).toBeTruthy();
		expect(screen.getByText('Danger zone')).toBeTruthy();
	});

	test('does not render fabricated 2FA/session/security-activity data', () => {
		renderTab();

		expect(screen.queryByText('2FA')).toBeNull();
		expect(screen.queryByText('Sessions')).toBeNull();
		expect(screen.queryByText('Recent security activity')).toBeNull();
	});

	test('renders the assigned profiles empty state when none are assigned', () => {
		renderTab(buildContextValue({ profiles: [] }));

		expect(screen.getByText('0 assigned')).toBeTruthy();
		expect(
			screen.getByText('No profiles are currently assigned.'),
		).toBeTruthy();
	});

	test('renders a local assigned profiles error instead of the list', () => {
		renderTab(buildContextValue({ profilesHasError: true }));

		expect(screen.getByTestId('staff-user-profiles-error')).toBeTruthy();
		expect(screen.queryByText('Assigned profiles & roles')).toBeNull();
	});

	test('clicking "Try again" on the profiles error retries the query (r5-F6)', () => {
		renderTab(buildContextValue({ profilesHasError: true }));

		fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(mocks.onRetryProfiles).toHaveBeenCalledTimes(1);
	});

	test('renders a profiles loading state instead of "no profiles assigned" while the profiles query is still pending (r5-F6)', () => {
		renderTab(buildContextValue({ profilesIsPending: true, profiles: [] }));

		expect(screen.getByTestId('staff-user-profiles-loading')).toBeTruthy();
		expect(
			screen.queryByText('No profiles are currently assigned.'),
		).toBeNull();
		expect(screen.queryByText('0 assigned')).toBeNull();
	});

	test('pending wins over both the error and empty-collection renders', () => {
		renderTab(
			buildContextValue({
				profilesIsPending: true,
				profilesHasError: true,
				profiles: [],
			}),
		);

		expect(screen.getByTestId('staff-user-profiles-loading')).toBeTruthy();
		expect(screen.queryByTestId('staff-user-profiles-error')).toBeNull();
	});

	test('clicking suspend/reactivate in the danger zone calls the context callback', () => {
		renderTab();

		fireEvent.click(screen.getByText('Suspend'));

		expect(mocks.onOpenSuspendDialog).toHaveBeenCalledTimes(1);
	});

	test('reads Reactivate and is enabled when reactivation is allowed', () => {
		renderTab(
			buildContextValue({
				canSuspend: false,
				canReactivate: true,
				suspendLabelKey: 'reactivate',
			}),
		);

		const reactivateButton = screen.getByText(
			'Reactivate',
		) as HTMLButtonElement;
		expect(reactivateButton.disabled).toBe(false);

		fireEvent.click(reactivateButton);
		expect(mocks.onOpenSuspendDialog).toHaveBeenCalledTimes(1);
	});

	test('disables the suspend/reactivate action when neither is allowed', () => {
		renderTab(buildContextValue({ canSuspend: false, canReactivate: false }));

		expect((screen.getByText('Suspend') as HTMLButtonElement).disabled).toBe(
			true,
		);
	});

	test('clicking delete in the danger zone calls the context callback', () => {
		renderTab();

		fireEvent.click(screen.getByText('Delete'));

		expect(mocks.onOpenDeleteDialog).toHaveBeenCalledTimes(1);
	});

	test('disables delete while a delete mutation is pending', () => {
		renderTab(buildContextValue({ isDeletePending: true }));

		expect((screen.getByText('Delete') as HTMLButtonElement).disabled).toBe(
			true,
		);
	});

	test('does not import the overview context from the parent route module', () => {
		// Regression guard: importing the context hook from the '$userId' route
		// module (instead of this leaf '_overview-context' module) causes the
		// route module to be duplicated into two build chunks with two distinct
		// React context instances, and the real hook throws at runtime. This
		// must catch every specifier shape that resolves to that parent
		// module — relative or aliased, with or without an explicit
		// extension — not just the exact string this bug shipped with once
		// already. See the `crossBoundaryImport` regex tests below for the
		// specifier shapes this is verified to catch and to leave alone.
		const currentFilePath = fileURLToPath(import.meta.url);
		const filePath = join(dirname(currentFilePath), 'index.tsx');
		const source = readFileSync(filePath, 'utf8');

		expect(source).not.toMatch(crossBoundaryImport);
	});
});

// A specifier reaches the parent '$userId' route module — and reintroduces
// the duplicate-context crash — whenever it resolves to that module,
// regardless of prefix (relative or the `~/` alias) or explicit extension.
// Requiring the closing quote immediately after `$userId`/`$userId.tsx` is
// what excludes legitimate child-path imports like `./$userId/activity` or
// unrelated siblings like `./_overview-context`.
const crossBoundaryImport = /from\s+['"][^'"]*\$userId(\.tsx)?['"]/;

describe('crossBoundaryImport regex', () => {
	test.each([
		"import { useStaffUserOverviewContext } from '~/routes/authed/staff/staff-users/$userId';",
		"import { useStaffUserOverviewContext } from '~/routes/authed/staff/staff-users/$userId.tsx';",
		"import { useStaffUserOverviewContext } from '../$userId';",
		"import { useStaffUserOverviewContext } from '../$userId.tsx';",
		"import { useStaffUserOverviewContext } from './../$userId';",
	])('flags a cross-boundary import: %s', (line) => {
		expect(line).toMatch(crossBoundaryImport);
	});

	test.each([
		"import { StaffUserOverviewContext } from './_overview-context';",
		"import type { StaffUserOverviewContextValue } from './_overview-context';",
		"import { ActivityTab } from './$userId/activity';",
		"import type { AssignedStaffProfile } from '~/lib/query/staff-users';",
	])('leaves a legitimate import alone: %s', (line) => {
		expect(line).not.toMatch(crossBoundaryImport);
	});
});
