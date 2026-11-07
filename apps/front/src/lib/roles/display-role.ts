/**
 * #2291 M9: the default system role is seeded with the English strings
 * "Default role" / "Default role with no permissions". The row is real
 * product data, but its copy is product copy — so every surface renders the
 * translated name/description for `isDefault` rows instead of the stored
 * English. Existing organisations are covered with no data migration: the
 * translation happens at render time from `isDefault`, which every tenant
 * role already carries.
 */
type DefaultableRole = {
	name: string;
	description: string | null;
	isDefault: boolean;
};

type Translate = (key: string) => string;

/*
 * Only the untouched seeded copy is translated. A default role can be
 * renamed (the API PATCHes its name), and its rename must stay visible.
 */
const SEEDED_DEFAULT_ROLE_NAME = 'Default role';
const SEEDED_DEFAULT_ROLE_DESCRIPTION = 'Default role with no permissions';

export const displayRoleName = (
	role: Pick<DefaultableRole, 'name' | 'isDefault'>,
	t: Translate,
): string =>
	role.isDefault && role.name === SEEDED_DEFAULT_ROLE_NAME
		? t('common:default-role-name')
		: role.name;

export const displayRoleDescription = (
	role: DefaultableRole,
	t: Translate,
): string | null =>
	role.isDefault && role.description === SEEDED_DEFAULT_ROLE_DESCRIPTION
		? t('common:default-role-description')
		: role.description;
