import type { ContextInventoryEntry } from './check-context-chunk-isolation.mts';

export const contextChunkIsolationInventory: readonly ContextInventoryEntry[] =
	[
		{
			name: 'AuthBrandContext',
			sourceFile: 'src/lib/auth-brand-context.tsx',
		},
		{
			name: 'SessionSurfaceValidationContext',
			sourceFile: 'src/lib/session-surface-recovery-context.tsx',
		},
		{
			name: 'StaffUserOverviewContext',
			sourceFile:
				'src/routes/authed/staff/staff-users/$userId/_overview-context.tsx',
		},
		{
			name: 'StaffTenantProfileDetailsContext',
			sourceFile:
				'src/routes/authed/staff/tenants/$tenantId/profiles/$profileId/_details-context.tsx',
		},
	];
