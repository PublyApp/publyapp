import { View403 } from '#app/components/error/403-view.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';

const TenantDetailsUsagePage = () => {
	if (!FEATURES.staff.tenants.details.usage) {
		return <View403 withLayout={false} />;
	}

	// This route is intentionally registered before implementation so the
	// sidebar IA can show the future tab while direct URL access stays locked.
	return <View403 withLayout={false} />;
};

export default TenantDetailsUsagePage;
