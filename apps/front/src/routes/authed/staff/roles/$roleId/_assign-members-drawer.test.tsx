/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	useUsersQuery: vi.fn(),
	mutateAsync: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
	toast: Object.assign(vi.fn(), {
		success: mocks.toastSuccess,
		warning: vi.fn(),
		error: mocks.toastError,
	}),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options ? `${key}:${Object.values(options).join(',')}` : key,
	}),
}));

vi.mock('~/lib/query/staff-role-users', () => ({
	useBulkAssignStaffRoleUsersMutation: () => ({
		mutateAsync: mocks.mutateAsync,
		isPending: false,
	}),
}));

vi.mock('~/lib/query/staff-users', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-users')>();
	return { ...actual, useStaffUsersQuery: mocks.useUsersQuery };
});

import { AssignMembersDrawer } from './_assign-members-drawer';

const ROLE_ID = 'role-1';
const item = (id: string, firstName: string) => ({
	id,
	email: `${firstName.toLowerCase()}@example.com`,
	firstName,
	lastName: 'Staff',
	roles: [],
});

const queryResult = (data: unknown[]) => ({
	data: { data },
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: false,
	error: null,
	refetch: vi.fn(),
});

const renderDrawer = (isOpen = true, onOpenChange = vi.fn()) => {
	render(
		<AssignMembersDrawer
			roleId={ROLE_ID}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			onSessionExpired={vi.fn()}
		/>,
	);
	return onOpenChange;
};

beforeEach(() => {
	mocks.useUsersQuery.mockReturnValue(
		queryResult([item('u1', 'Alice'), item('u2', 'Bob')]),
	);
	mocks.mutateAsync.mockResolvedValue({ succeededCount: 2, failedCount: 0 });
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('staff role assign members drawer', () => {
	test('renders nothing and fires no query while closed', () => {
		renderDrawer(false);
		expect(screen.queryByTestId('staff-assign-members-drawer')).toBeNull();
		expect(mocks.useUsersQuery).not.toHaveBeenCalled();
	});

	test('asks the API for the members not yet in the role (by id) and lists them, with the submit disabled until one is picked', () => {
		renderDrawer();
		expect(screen.getByLabelText('Alice Staff')).toBeTruthy();
		expect(screen.getByLabelText('Bob Staff')).toBeTruthy();
		// Members already in the role are excluded by the server, by id.
		expect(mocks.useUsersQuery).toHaveBeenCalledWith(
			expect.objectContaining({ excludeRoleId: ROLE_ID }),
		);
		const submit = screen.getByRole('button', {
			name: 'assign-selected-members:0',
		});
		expect((submit as HTMLButtonElement).disabled).toBe(true);
	});

	test('submits the selected members, toasts the success and closes', async () => {
		const onOpenChange = renderDrawer();
		fireEvent.click(screen.getByLabelText('Alice Staff'));
		fireEvent.click(screen.getByLabelText('Bob Staff'));
		fireEvent.click(
			screen.getByRole('button', { name: 'assign-selected-members:2' }),
		);

		await waitFor(() =>
			expect(mocks.mutateAsync).toHaveBeenCalledWith({
				roleId: ROLE_ID,
				userIds: ['u1', 'u2'],
			}),
		);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'staff-role-user-bulk-assign-success:2',
		);
	});

	test('reports a skipped member with its translated reason, then closes', async () => {
		mocks.mutateAsync.mockResolvedValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [{ userId: 'u2', reason: 'already_assigned' }],
		});
		const onOpenChange = renderDrawer();
		fireEvent.click(screen.getByLabelText('Alice Staff'));
		fireEvent.click(screen.getByLabelText('Bob Staff'));
		fireEvent.click(
			screen.getByRole('button', { name: 'assign-selected-members:2' }),
		);

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
		const [message, options] = mocks.toastError.mock.calls[0] as [
			string,
			{ description?: string },
		];
		expect(message).toBe('staff-role-user-bulk-assign-partial-success:1,1');
		expect(options.description).toBe(
			'Bob Staff: bulk-assign-failed-item-already-assigned',
		);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	test('keeps the drawer open when the request fails', async () => {
		mocks.mutateAsync.mockRejectedValue(new Error('boom'));
		const onOpenChange = renderDrawer();
		fireEvent.click(screen.getByLabelText('Alice Staff'));
		fireEvent.click(
			screen.getByRole('button', { name: 'assign-selected-members:1' }),
		);

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
