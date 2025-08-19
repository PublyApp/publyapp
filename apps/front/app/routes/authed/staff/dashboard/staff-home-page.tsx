import { EmptyContent } from '@/front/components/empty-content';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';

const StaffHomePage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<EmptyContent title={t('no-data')} />
		</DashboardContent>
	);
};

export default StaffHomePage;
