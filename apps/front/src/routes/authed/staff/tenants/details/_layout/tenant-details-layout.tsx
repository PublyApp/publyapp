import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import type { FC } from 'react';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { ErrorContent } from '@/front/components/empty-content/error-content';
import View400 from '@/front/components/error/400-view';
import QueryDisplay from '@/front/components/query-display';
import type { SettingsNavItem } from '@/front/components/settings/settings-nav';
import { SidebarSettingsLayout } from '@/front/components/settings/sidebar-settings-layout';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { isProblemFailure, toApiFailure } from '@/front/lib/api-failure';
import { useGetTenant } from '@/front/lib/react-query/features/staff/staff-tenant.hooks';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/tenant-details-layout';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('tenant-details'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

const TenantDetailsLayout = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();

	const getTenantQuery = useGetTenant({
		variables: { tenantId: _.toString(tenantId) },
		enabled: !!tenantId,
	});

	const navItems: SettingsNavItem[] = useMemo(() => {
		const paths = FRONT_PATH_NAMES.staff.tenants.details(tenantId);

		return [
			{ label: t('general'), href: paths.tabs.general },
			{ label: t('users'), href: paths.tabs.users, deep: true },
			{
				label: t('profiles'),
				href: paths.tabs.profiles,
				deep: true,
			},
			{ label: t('billing'), href: paths.tabs.billing, deep: true },
		];
	}, [t, tenantId]);

	if (!tenantId) {
		return <View400 title="Bad Request" description="Tenant ID is required" />;
	}

	return (
		<QueryDisplay
			query={getTenantQuery}
			LoadingSlot={<TenantDetailsLayoutSkeleton />}
			ErrorSlot={LayoutErrorView}
		>
			{() => <SidebarSettingsLayout items={navItems} />}
		</QueryDisplay>
	);
};

export default TenantDetailsLayout;

const TenantDetailsLayoutEmpty = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent maxWidth="lg" compact>
			<Box sx={{ py: 10 }}>
				<EmptyContent
					title={_.capitalize(
						t('no-items-found', {
							item: t('tenant'),
							ns: 'response-message',
						}),
					)}
					description={_.capitalize(t('tenant-not-found-description-empty'))}
					imgUrl="/assets/icons/empty/ic-content.svg"
				/>
			</Box>
		</DashboardContent>
	);
};

const LayoutErrorView: FC<{ error: unknown }> = ({ error }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);

	if (isProblemFailure(failure) && failure.status === 404) {
		return <TenantDetailsLayoutEmpty />;
	}

	return (
		<DashboardContent maxWidth="lg" compact>
			<Box sx={{ py: 10 }}>
				<ErrorContent
					title={t('tenant-details-error-title')}
					description={t('tenant-details-error-description')}
				/>
			</Box>
		</DashboardContent>
	);
};

const NavItemSkeleton = () => (
	<Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1 }} />
);

const TenantDetailsLayoutSkeleton = () => (
	<DashboardContent maxWidth="lg" compact>
		<Box
			sx={{
				display: 'flex',
				gap: 4,
				flexDirection: { xs: 'column', md: 'row' },
			}}
		>
			{/* Sidebar skeleton */}
			<Box
				sx={{
					display: { xs: 'none', md: 'block' },
					flexShrink: 0,
					width: 200,
				}}
			>
				<Stack spacing={0.5}>
					<NavItemSkeleton />
					<NavItemSkeleton />
					<NavItemSkeleton />
					<NavItemSkeleton />
				</Stack>
			</Box>

			{/* Content area skeleton */}
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Skeleton variant="text" width={200} height={32} sx={{ mb: 2 }} />
				<Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
			</Box>
		</Box>
	</DashboardContent>
);
