import type { StaffTenantPermissionGroup } from '~/lib/query/staff-tenant-profiles';

type ProfileGlanceModule = {
	moduleKey: string;
	moduleLabel: string;
	grantedCount: number;
	totalCount: number;
};

/**
 * Everything the Overview tab needs to render the permission stat cards and
 * the "Permissions at a glance" card, computed once from the tenant
 * permission catalog groups + the profile's granted permission keys.
 *
 * - `grantedTotal` (K) / `catalogTotal` (T): granted vs total catalog keys.
 * - `modulesWithAccess` (M) / `totalModules` (MT): modules with ≥1 granted key.
 *
 * The glance card itself only ever needs a granted-of-total count per
 * module (never the individual permission keys) — the full per-permission
 * detail lives on the Permissions tab, which the card's "Manage" link opens.
 *
 * Granted keys are intersected against the catalog, so a stale/removed key
 * never inflates the "K" count beyond what the catalog can display (honest).
 */
export type ProfilePermissionGlance = {
	modules: ProfileGlanceModule[];
	grantedTotal: number;
	catalogTotal: number;
	modulesWithAccess: number;
	totalModules: number;
};

export const buildProfilePermissionGlance = (
	groups: StaffTenantPermissionGroup[],
	grantedKeys: string[],
): ProfilePermissionGlance => {
	const grantedKeySet = new Set(grantedKeys);
	const modules: ProfileGlanceModule[] = [];
	let grantedTotal = 0;
	let catalogTotal = 0;

	for (const group of groups) {
		const grantedCount = group.options.filter((option) =>
			grantedKeySet.has(option.key),
		).length;

		grantedTotal += grantedCount;
		catalogTotal += group.options.length;

		modules.push({
			moduleKey: group.moduleKey,
			moduleLabel: group.moduleLabel,
			grantedCount,
			totalCount: group.options.length,
		});
	}

	const modulesWithAccess = modules.filter(
		(module) => module.grantedCount > 0,
	).length;

	return {
		modules,
		grantedTotal,
		catalogTotal,
		modulesWithAccess,
		totalModules: modules.length,
	};
};
