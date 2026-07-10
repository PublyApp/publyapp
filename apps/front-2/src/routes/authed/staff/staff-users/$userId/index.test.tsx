/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useStaffUserOverviewContext: vi.fn(),
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

vi.mock('~/routes/authed/staff/staff-users/$userId', () => ({
	useStaffUserOverviewContext: mocks.useStaffUserOverviewContext,
}));

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

const buildContextValue = (overrides: Record<string, unknown> = {}) => ({
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

const renderTab = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

describe('staff user overview tab', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useStaffUserOverviewContext.mockReturnValue(buildContextValue());
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
		mocks.useStaffUserOverviewContext.mockReturnValue(
			buildContextValue({ profiles: [] }),
		);

		renderTab();

		expect(screen.getByText('0 assigned')).toBeTruthy();
		expect(
			screen.getByText('No profiles are currently assigned.'),
		).toBeTruthy();
	});

	test('renders a local assigned profiles error instead of the list', () => {
		mocks.useStaffUserOverviewContext.mockReturnValue(
			buildContextValue({ profilesHasError: true }),
		);

		renderTab();

		expect(screen.getByTestId('staff-user-profiles-error')).toBeTruthy();
		expect(screen.queryByText('Assigned profiles & roles')).toBeNull();
	});

	test('clicking suspend/reactivate in the danger zone calls the context callback', () => {
		renderTab();

		fireEvent.click(screen.getByText('Suspend'));

		expect(mocks.onOpenSuspendDialog).toHaveBeenCalledTimes(1);
	});

	test('reads Reactivate and is enabled when reactivation is allowed', () => {
		mocks.useStaffUserOverviewContext.mockReturnValue(
			buildContextValue({
				canSuspend: false,
				canReactivate: true,
				suspendLabel: 'Reactivate',
			}),
		);

		renderTab();

		const reactivateButton = screen.getByText(
			'Reactivate',
		) as HTMLButtonElement;
		expect(reactivateButton.disabled).toBe(false);

		fireEvent.click(reactivateButton);
		expect(mocks.onOpenSuspendDialog).toHaveBeenCalledTimes(1);
	});

	test('disables the suspend/reactivate action when neither is allowed', () => {
		mocks.useStaffUserOverviewContext.mockReturnValue(
			buildContextValue({ canSuspend: false, canReactivate: false }),
		);

		renderTab();

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
		mocks.useStaffUserOverviewContext.mockReturnValue(
			buildContextValue({ isDeletePending: true }),
		);

		renderTab();

		expect((screen.getByText('Delete') as HTMLButtonElement).disabled).toBe(
			true,
		);
	});
});
