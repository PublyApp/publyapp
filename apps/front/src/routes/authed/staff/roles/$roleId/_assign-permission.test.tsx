/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetcher: vi.fn() }));

vi.mock('~/lib/query/staff-jobs', () => ({
	staffJobPermissionsQueryOptions: {
		queryKey: () => ['perm-test'],
		fetcher: mocks.fetcher,
	},
}));

import { useCanAssignStaffRoleMembers } from './_assign-permission';

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={new QueryClient()}>
		{children}
	</QueryClientProvider>
);

const can = async (payload: unknown): Promise<boolean> => {
	mocks.fetcher.mockResolvedValue(payload);
	const { result } = renderHook(() => useCanAssignStaffRoleMembers(), {
		wrapper,
	});
	await waitFor(() => expect(mocks.fetcher).toHaveBeenCalled());
	// The first render is `false` while pending; wait for the settled value.
	await new Promise((resolve) => setTimeout(resolve, 20));
	return result.current;
};

describe('useCanAssignStaffRoleMembers', () => {
	test('needs BOTH role-update and user-list', async () => {
		expect(
			await can({
				code: 'staff',
				permissions: [
					'staff.roles.update_for_staff',
					'staff.users.list_for_staff',
				],
			}),
		).toBe(true);
		expect(
			await can({
				code: 'staff',
				permissions: ['staff.roles.update_for_staff'],
			}),
		).toBe(false);
		expect(
			await can({ code: 'staff', permissions: ['staff.users.list_for_staff'] }),
		).toBe(false);
	});

	test('a full-access account bypasses the per-key check', async () => {
		expect(await can({ code: 'staff', isAdmin: true, permissions: [] })).toBe(
			true,
		);
	});

	test('a non-staff payload grants nothing', async () => {
		expect(
			await can({
				code: 'tenant',
				isAdmin: true,
				permissions: [
					'staff.roles.update_for_staff',
					'staff.users.list_for_staff',
				],
			}),
		).toBe(false);
	});
});
