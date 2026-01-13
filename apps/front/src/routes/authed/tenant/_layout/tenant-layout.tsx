import * as cookie from 'cookie';
import { Suspense, useEffect } from 'react';
import { Outlet, useParams } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { LoadingScreen } from '#app/components/loading-screen/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardLayout } from '#app/layouts/dashboard/layout.tsx';
import { ICONS, type NavDataType } from '#app/layouts/nav-config-dashboard.tsx';
import {
	clearLegacyTenantFromBrowser,
	readLegacyTenantFromBrowser,
	updateTenantHintInBrowser,
} from '#app/lib/cookies/tenant-hint-cookie.utils.ts';
import { useGetUserAuthData } from '#app/lib/react-query/features/common/auth.hooks.ts';

const TenantLayout = () => {
	const { t } = useTranslate();
	const { tenantId = '' } = useParams();
	const { data: userAuthData } = useGetUserAuthData();
	const userId = userAuthData?.id;

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

	const tenantPaths = FRONT_PATH_NAMES.tenant(tenantId);

	const tenantNavData: NavDataType = [
		{
			items: [
				{
					title: t('calendar'),
					path: tenantPaths.root,
					icon: ICONS.calendar,
					deepActiveMatch: false,
				},
				{
					title: t('queue'),
					path: tenantPaths.posts.root,
					icon: ICONS.queue,
					deepActiveMatch: false,
				},
				{
					title: t('drafts'),
					path: tenantPaths.posts.drafts,
					icon: ICONS.drafts,
					deepActiveMatch: true,
				},
				{
					title: t('history'),
					path: tenantPaths.posts.history,
					icon: ICONS.history,
					deepActiveMatch: false,
				},
			],
		},
		{
			subheader: t('settings'),
			collapsible: false,
			items: [
				{
					title: t('settings'),
					path: tenantPaths.settings.root,
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
