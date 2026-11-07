import type { StaffRoleItem } from '@org/client-ts/models/index';

export type StaffRoleOption = {
	value: string;
	label: string;
	description?: string;
};

type BuildStaffRoleOptionsArgs = {
	roles:
		| Array<Pick<StaffRoleItem, 'id' | 'name' | 'description'>>
		| null
		| undefined;
	selectedRoleIds: string[];
	knownRoleNames: ReadonlyMap<string, string>;
	includeDescriptions?: boolean;
};

const getStaffRoleId = (role: Pick<StaffRoleItem, 'id'>): string | undefined =>
	typeof role.id === 'string' && role.id.length > 0 ? role.id : undefined;

export const collectSelectedRoleIds = (
	roleIdGroups: Array<readonly string[] | undefined> | undefined,
): string[] => {
	const selected = new Set<string>();
	for (const roleIds of roleIdGroups ?? []) {
		for (const roleId of roleIds ?? []) {
			if (roleId) {
				selected.add(roleId);
			}
		}
	}

	return [...selected];
};

export const rememberStaffRoleNames = (
	knownRoleNames: Map<string, string>,
	roles: Array<Pick<StaffRoleItem, 'id' | 'name'>> | null | undefined,
) => {
	for (const role of roles ?? []) {
		const roleId = getStaffRoleId(role);
		const label = role.name?.trim();
		if (!roleId || !label) {
			continue;
		}

		knownRoleNames.set(roleId, label);
	}
};

export const buildStaffRoleOptions = ({
	roles,
	selectedRoleIds,
	knownRoleNames,
	includeDescriptions = false,
}: BuildStaffRoleOptionsArgs): StaffRoleOption[] => {
	const options: StaffRoleOption[] = [];
	const seen = new Set<string>();

	for (const role of roles ?? []) {
		const roleId = getStaffRoleId(role);
		if (!roleId || seen.has(roleId)) {
			continue;
		}

		const description = includeDescriptions
			? role.description?.trim()
			: undefined;
		const option: StaffRoleOption = {
			value: roleId,
			label: role.name?.trim() || knownRoleNames.get(roleId) || roleId,
		};
		if (description) {
			option.description = description;
		}
		options.push(option);
		seen.add(roleId);
	}

	for (const roleId of selectedRoleIds) {
		if (!roleId || seen.has(roleId)) {
			continue;
		}

		options.push({
			value: roleId,
			label: knownRoleNames.get(roleId) || roleId,
		});
		seen.add(roleId);
	}

	return options;
};
