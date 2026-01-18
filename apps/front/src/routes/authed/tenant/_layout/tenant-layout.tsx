import * as cookie from 'cookie';
import { Suspense, useEffect } from 'react';
import { Outlet, useParams } from 'react-router';

import duration from '@org/shared/utils/duration.utils';
import { LoadingScreen } from '@/front/components/loading-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardLayout } from '@/front/layouts/dashboard/layout';
import { ICONS, type NavDataType } from '@/front/layouts/nav-config-dashboard';
import {
	FRONT_PATH_NAMES,
	LAST_USED_TENANT_ID_COOKIE_KEY,
} from '@/shared/lib/constants';

const TenantLayout = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();

	// Update last used tenant cookie whenever tenantId changes or tab gains focus
	useEffect(() => {
		const updateCookie = () => {
			if (tenantId) {
				const lastUsedTenantCookie = cookie.serialize(
					LAST_USED_TENANT_ID_COOKIE_KEY,
					tenantId,
					{
						path: '/',
						maxAge: duration.toSeconds('3d'),
					},
				);
				document.cookie = lastUsedTenantCookie;
			}
		};

		// Update on mount and when tenantId changes
		updateCookie();

		// Update when tab becomes visible (user switches back to this tab)
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				updateCookie();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [tenantId]);

	const tenantNavData: NavDataType = [
		{
			items: [
				{
					title: t('posts-calendar'),
					path: FRONT_PATH_NAMES.tenant(tenantId).root,
					icon: ICONS.calendar,
					deepActiveMatch: false,
				},
				{
					title: t('drafts'),
					path: '#',
					icon: ICONS.file,
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
