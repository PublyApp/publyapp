import { View403 } from '#app/components/error/index.ts';

import { TENANT_DETAILS_ACTIVITY_ENABLED } from '../_layout/tenant-details-feature-flags';

const TenantDetailsActivityPage = () => {
	if (!TENANT_DETAILS_ACTIVITY_ENABLED) {
		return <View403 withLayout={false} />;
	}

	// This route is intentionally wired before the feature is implemented so
	// direct URL access stays guarded by the same flag that locks the sidebar.
	return <View403 withLayout={false} />;
};

export default TenantDetailsActivityPage;
