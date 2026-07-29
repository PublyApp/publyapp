import type { StaffTenantPermissionGroup } from '~/lib/query/staff-tenant-profiles';

export type ProfileGlanceOption = {
	key: string;
	label: string;
	granted: boolean;
};

export type ProfileGlanceModule = {
	moduleKey: string;
	moduleLabel: string;
	grantedCount: number;
	totalCount: number;
	options: ProfileGlanceOption[];
};

/**
 * Everything the Overview tab needs to render the permission stat cards and
 * the "Permissions at a glance" card, computed once from the tenant
 * permission catalog groups + the profile's granted permission keys.
 *
 * - `grantedTotal` (K) / `catalogTotal` (T): granted vs total catalog keys.
 * - `modulesWithAccess` (M) / `totalModules` (MT): modules with ≥1 granted key.
 * - `zeroAccessModuleLabels`: modules with no granted key (the glance footer).
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
	zeroAccessModuleLabels: string[];
};

export const buildProfilePermissionGlance = (
	groups: StaffTenantPermissionGroup[],
	grantedKeys: string[],
): ProfilePermissionGlance => {
	const grantedKeySet = new Set(grantedKeys);
	const modules: ProfileGlanceModule[] = [];
	let grantedTotal = 0;
	let catalogTotal = 0;
	const zeroAccessModuleLabels: string[] = [];

	for (const group of groups) {
		const options: ProfileGlanceOption[] = group.options.map((option) => ({
			key: option.key,
			label: option.label,
			granted: grantedKeySet.has(option.key),
		}));
		const grantedCount = options.filter((option) => option.granted).length;

		grantedTotal += grantedCount;
		catalogTotal += options.length;

		if (grantedCount === 0) {
			zeroAccessModuleLabels.push(group.moduleLabel);
		}

		modules.push({
			moduleKey: group.moduleKey,
			moduleLabel: group.moduleLabel,
			grantedCount,
			totalCount: options.length,
			options,
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
		zeroAccessModuleLabels,
	};
};
