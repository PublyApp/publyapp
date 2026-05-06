import { View403 } from '#app/components/error/403-view.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';

const TenantDetailsActivityPage = () => {
	if (!FEATURES.staff.tenants.details.activity) {
		return <View403 withLayout={false} />;
	}

	// This route is intentionally wired before the feature is implemented so
	// direct URL access stays guarded by the same flag that locks the sidebar.
	return <View403 withLayout={false} />;
};

export default TenantDetailsActivityPage;
