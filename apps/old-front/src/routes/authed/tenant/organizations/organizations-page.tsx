import { TenantPickerView } from '../_shared/tenant-picker-view';

/**
 * Standalone organizations page at /app/organizations.
 * Shows the tenant picker directly without any redirect logic.
 * Used as the target when navigating from the "tenant suspended" page.
 */
const OrganizationsPage = () => {
	return <TenantPickerView />;
};

export default OrganizationsPage;
