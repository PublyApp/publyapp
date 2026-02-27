import { Suspense, useEffect } from 'react';
import { Outlet, useParams } from 'react-router';

import { LoadingScreen } from '@/front/components/loading-screen';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardLayout } from '@/front/layouts/dashboard/layout';
import { ICONS, type NavDataType } from '@/front/layouts/nav-config-dashboard';
import {
	clearLegacyTenantFromBrowser,
	readLegacyTenantFromBrowser,
	updateTenantHintInBrowser,
} from '@/front/lib/cookies/tenant-hint-cookie.utils';
import { useGetUserAuthData } from '@/front/lib/react-query/features/common/auth.hooks';
import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

const TenantLayout = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const { data: userAuthData } = useGetUserAuthData();
	const userId = userAuthData?.id;

	// Update tenant hint cookie whenever tenantId changes or tab gains focus
	// Uses identity-scoped mapping: {userId: tenantId}
	useEffect(() => {
		const updateCookie = () => {
			if (tenantId && userId) {
				updateTenantHintInBrowser(userId, tenantId);

				// One-time migration: clear legacy cookie if it exists
				// (Browser can only clear accessible paths - root path is enough client-side)
				if (readLegacyTenantFromBrowser()) {
					clearLegacyTenantFromBrowser();
				}
			}
		};

		// Update on mount and when tenantId/userId changes
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
	}, [tenantId, userId]);

	const tenantNavData: NavDataType = [
		{
			subheader: t('posts'),
			collapsible: false,
			items: [
				{
					title: t('calendar'),
					path: FRONT_PATH_NAMES.tenant(tenantId).root,
					icon: ICONS.calendar,
					deepActiveMatch: false,
				},
				{
					title: t('queue'),
					path: FRONT_PATH_NAMES.tenant(tenantId).posts.root,
					icon: ICONS.queue,
					deepActiveMatch: false,
				},
				{
					title: t('drafts'),
					path: FRONT_PATH_NAMES.tenant(tenantId).posts.drafts,
					icon: ICONS.drafts,
					deepActiveMatch: true,
				},
				{
					title: t('history'),
					path: FRONT_PATH_NAMES.tenant(tenantId).posts.history,
					icon: ICONS.history,
					deepActiveMatch: false,
				},
			],
		},
		{
			subheader: t('others'),
			collapsible: false,
			items: [
				{
					title: t('settings'),
					path: FRONT_PATH_NAMES.tenant(tenantId).settings.root,
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
