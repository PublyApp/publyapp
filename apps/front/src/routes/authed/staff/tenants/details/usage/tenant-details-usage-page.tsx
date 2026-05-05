import { View403 } from '#app/components/error/index.ts';

import { TENANT_DETAILS_USAGE_ENABLED } from '../_layout/tenant-details-feature-flags';

const TenantDetailsUsagePage = () => {
	if (!TENANT_DETAILS_USAGE_ENABLED) {
		return <View403 withLayout={false} />;
	}

	// This route is intentionally registered before implementation so the
	// sidebar IA can show the future tab while direct URL access stays locked.
	return <View403 withLayout={false} />;
};

export default TenantDetailsUsagePage;
