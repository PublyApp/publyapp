import { Suspense } from 'react';
import { Outlet, useParams } from 'react-router';

import { LoadingScreen } from '@/front/components/loading-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardLayout } from '@/front/layouts/dashboard/layout';
import { ICONS, type NavDataType } from '@/front/layouts/nav-config-dashboard';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

const TenantLayout = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();

	const tenantNavData: NavDataType = [
		{
			items: [
				{
					title: t('dashboard'),
					path: FRONT_PATH_NAMES.tenant(tenantId).root,
					icon: ICONS.dashboard,
					deepActiveMatch: false,
				},
				{
					title: t('drafts'),
					path: FRONT_PATH_NAMES.tenant(tenantId).drafts.root,
					icon: ICONS.file,
					deepActiveMatch: true,
				},
			],
		},
		{
			subheader: t('settings'),
			collapsible: false,
			items: [
				{
					title: t('general'),
					path: FRONT_PATH_NAMES.tenant(tenantId).settings.general,
					icon: ICONS.settings,
					deepActiveMatch: true,
				},
			],
		},
	];

	return (
		<DashboardLayout slotProps={{ nav: { data: tenantNavData } }}>
			<Suspense fallback={<LoadingScreen />}>
				<Outlet />
			</Suspense>
		</DashboardLayout>
	);
};

export default TenantLayout;
