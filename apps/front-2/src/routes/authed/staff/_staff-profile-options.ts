import type { StaffProfileItem } from '@org/client-ts/src/models/index.js';

export type StaffProfileOption = {
	value: string;
	label: string;
	description?: string;
};

type BuildStaffProfileOptionsArgs = {
	profiles:
		| Array<Pick<StaffProfileItem, 'id' | 'name' | 'description'>>
		| null
		| undefined;
	selectedProfileIds: string[];
	knownProfileNames: ReadonlyMap<string, string>;
};

const getStaffProfileId = (
	profile: Pick<StaffProfileItem, 'id'>,
): string | undefined =>
	typeof profile.id === 'string' && profile.id.length > 0
		? profile.id
		: undefined;

export const collectSelectedProfileIds = (
	profileIdGroups: Array<readonly string[] | undefined> | undefined,
): string[] => {
	const selected = new Set<string>();
	for (const profileIds of profileIdGroups ?? []) {
		for (const profileId of profileIds ?? []) {
			if (profileId) {
				selected.add(profileId);
			}
		}
	}

	return [...selected];
};

export const rememberStaffProfileNames = (
	knownProfileNames: Map<string, string>,
	profiles: Array<Pick<StaffProfileItem, 'id' | 'name'>> | null | undefined,
) => {
	for (const profile of profiles ?? []) {
		const profileId = getStaffProfileId(profile);
		const label = profile.name?.trim();
		if (!profileId || !label) {
			continue;
		}

		knownProfileNames.set(profileId, label);
	}
};

export const buildStaffProfileOptions = ({
	profiles,
	selectedProfileIds,
	knownProfileNames,
}: BuildStaffProfileOptionsArgs): StaffProfileOption[] => {
	const options: StaffProfileOption[] = [];
	const seen = new Set<string>();

	for (const profile of profiles ?? []) {
		const profileId = getStaffProfileId(profile);
		if (!profileId || seen.has(profileId)) {
			continue;
		}

		const description = profile.description?.trim();
		options.push({
			value: profileId,
			label:
				profile.name?.trim() || knownProfileNames.get(profileId) || profileId,
			...(description ? { description } : {}),
		});
		seen.add(profileId);
	}

	for (const profileId of selectedProfileIds) {
		if (!profileId || seen.has(profileId)) {
			continue;
		}

		options.push({
			value: profileId,
			label: knownProfileNames.get(profileId) || profileId,
		});
		seen.add(profileId);
	}

	return options;
};
