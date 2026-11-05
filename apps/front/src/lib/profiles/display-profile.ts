/**
 * #2291 M9: the default system profile is seeded with the English strings
 * "Default profile" / "Default profile with no permissions". The row is real
 * product data, but its copy is product copy — so every surface renders the
 * translated name/description for `isDefault` rows instead of the stored
 * English. Existing organisations are covered with no data migration: the
 * translation happens at render time from `isDefault`, which every tenant
 * profile already carries.
 */
type DefaultableProfile = {
	name: string;
	description: string | null;
	isDefault: boolean;
};

type Translate = (key: string) => string;

/*
 * Only the untouched seeded copy is translated. A default profile can be
 * renamed (the API PATCHes its name), and its rename must stay visible.
 */
const SEEDED_DEFAULT_PROFILE_NAME = 'Default profile';
const SEEDED_DEFAULT_PROFILE_DESCRIPTION =
	'Default profile with no permissions';

export const displayProfileName = (
	profile: Pick<DefaultableProfile, 'name' | 'isDefault'>,
	t: Translate,
): string =>
	profile.isDefault && profile.name === SEEDED_DEFAULT_PROFILE_NAME
		? t('common:default-profile-name')
		: profile.name;

export const displayProfileDescription = (
	profile: DefaultableProfile,
	t: Translate,
): string | null =>
	profile.isDefault &&
	profile.description === SEEDED_DEFAULT_PROFILE_DESCRIPTION
		? t('common:default-profile-description')
		: profile.description;
