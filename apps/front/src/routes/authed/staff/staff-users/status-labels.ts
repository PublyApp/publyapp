const STAFF_STATUS_ACTIVE = 'active';
const STAFF_STATUS_SUSPENDED = 'suspended';
/** Formats the raw backend staff-user status (e.g. `"Active"`) for display —
 * mirrors `formatTenantStatusLabel` (`tenants/$tenantId/_tenant-details-shell.tsx`)
 * so the status pill never renders the unlocalized backend string directly. */
export const formatStaffStatusLabel = (
	status: string | null | undefined,
	t: (key: string) => string,
): string => {
	const normalized = status?.trim().toLowerCase() ?? '';
	if (normalized === STAFF_STATUS_ACTIVE) {
		return t('common:status-active');
	}
	if (normalized === STAFF_STATUS_SUSPENDED) {
		return t('common:status-suspended');
	}
	return t('common:status-unknown');
};
