import iconNames from './tenant-profile-icons.json' with { type: 'json' };

const TENANT_PROFILE_ICON_NAMES: readonly string[] = Object.freeze([
	...iconNames,
]);

export { TENANT_PROFILE_ICON_NAMES };
