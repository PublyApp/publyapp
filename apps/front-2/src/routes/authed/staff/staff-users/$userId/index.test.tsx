import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	onOpenSuspendDialog: vi.fn(),
	onOpenDeleteDialog: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
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

import { StaffUserOverviewContext } from './_overview-context';
import type { StaffUserOverviewContextValue } from './_overview-context';
import { Route } from './index';

const baseUser = {
	id: '11111111-1111-1111-1111-111111111111',
	email: 'owner@publyapp.local',
	firstName: 'Owner',
	lastName: 'User',
	avatarUrl: null,
	accountLevel: 'Owner',
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
	profilesHasError: false,
	maxProfilesPerUser: 5,
	canSuspend: true,
	canReactivate: false,
	suspendLabel: 'Suspend' as const,
	suspendDescription: 'Suspending this user revokes access.',
	isDeletePending: false,
	onOpenSuspendDialog: mocks.onOpenSuspendDialog,
	onOpenDeleteDialog: mocks.onOpenDeleteDialog,
	...overrides,
});

const renderTab = (
	contextValue: StaffUserOverviewContextValue = buildContextValue(),
) => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(
		<StaffUserOverviewContext.Provider value={contextValue}>
			<Component />
		</StaffUserOverviewContext.Provider>,
	);
};

describe('staff user overview tab', () => {
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
		expect(screen.getByText('No description')).toBeTruthy();
		expect(screen.getByText('Profile summary')).toBeTruthy();

		expect(screen.getByText('Account')).toBeTruthy();
		expect(screen.getByText('Recent security activity')).toBeTruthy();
		expect(screen.getByText('Danger zone')).toBeTruthy();
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
				suspendLabel: 'Reactivate',
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
