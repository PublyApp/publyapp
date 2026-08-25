/** Status-label helpers for the global staff tenant-user surfaces. Lives
 * outside `_details-shell.tsx` so that file exports only components
 * (react-doctor rung 2, #1417). */
/** Formats the raw backend status (`"Active"`/`"Suspended"`/
 * `"GloballySuspended"`) for display. Normalizes snake_case, kebab-case and
 * PascalCase spellings so the pill never renders an unlocalized raw value. */
export const formatGlobalTenantUserStatusLabel = (
	status: string | null | undefined,
	t: (key: string) => string,
): string => {
	const normalized = (status?.trim() ?? '')
		.replace(/[_\s]+/g, '-')
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.toLowerCase();
	if (normalized === 'active') {
		return t('status-active');
	}
	if (normalized === 'suspended') {
		return t('status-suspended');
	}
	if (normalized === 'globally-suspended') {
		return t('globally-suspended');
	}
	return t('status-unknown');
};
