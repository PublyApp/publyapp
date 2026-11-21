import type { FakeResponse } from '~/routes/authed/staff/_preload-test-harness';

/** Payloads a staff tenant page needs to mount its queries (tenant, role,
 * role permissions, role members, tenant permission catalogue). */
export const STAFF_TENANT_PRELOAD_RESPONSES: readonly (readonly [
	readonly string[],
	FakeResponse,
])[] = [
	[
		['tenants', 'byTenantId', 'get'],
		{
			tenantId: 't1',
			name: 'Acme Corporation',
			maxUsers: 10,
			status: 'Active',
		},
	],
	[['roles', 'byRoleId', 'get'], { role: { id: 'p1', name: 'Approvers' } }],
	[['roles', 'byRoleId', 'permissions', 'get'], { permissionKeys: [] }],
	[['byRoleId', 'users', 'get'], { users: [] }],
	[['permissions', 'scopes', 'tenant', 'get'], { additionalData: {} }],
];
