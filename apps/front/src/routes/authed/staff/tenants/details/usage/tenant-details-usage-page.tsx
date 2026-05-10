import { ComingSoonView } from '#app/components/error/coming-soon-view.tsx';

// This route is intentionally registered before the feature is built so the
// sidebar IA can show the future tab. Both the flag-OFF case and the
// not-yet-implemented case render the same ComingSoonView.
const TenantDetailsUsagePage = () => {
	return <ComingSoonView withLayout={false} />;
};

export default TenantDetailsUsagePage;
