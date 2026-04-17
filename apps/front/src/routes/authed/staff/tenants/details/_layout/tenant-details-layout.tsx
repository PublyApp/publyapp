import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import type { UseQueryResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import toStr from 'lodash/toString';
import type { FC } from 'react';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import type { GetTenantAsStaffResult } from '@org/client-ts/src/models';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';

import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import View400 from '#app/components/error/400-view.tsx';
import { NotFoundView } from '#app/components/error/not-found-view.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import type { SettingsNavItem } from '#app/components/settings/settings-nav.tsx';
import { SidebarSettingsLayout } from '#app/components/settings/sidebar-settings-layout.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetTenant } from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/tenant-details-layout';
import { TENANT_DETAILS_BILLING_ENABLED } from './tenant-details-feature-flags';

export type TenantDetailsOutletContext = {
	tenantName: string;
};

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(t('tenant-details'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return get(args.loaderData, 'meta', []);
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
		variables: { tenantId: toStr(tenantId) },
		enabled: !!tenantId,
	});

	const navItems: SettingsNavItem[] = useMemo(() => {
		const paths = FRONT_PATH_NAMES.staff.tenants.details(tenantId);

		return [
			{ label: t('general'), href: paths.tabs.general },
			{ label: t('users'), href: paths.tabs.users, deep: true },
			{ label: t('invitations'), href: paths.tabs.invitations, deep: true },
			{
				label: t('profiles'),
				href: paths.tabs.profiles,
				deep: true,
			},
			{
				label: t('billing'),
				href: paths.tabs.billing,
				deep: true,
				disabled: !TENANT_DETAILS_BILLING_ENABLED,
				endIcon: !TENANT_DETAILS_BILLING_ENABLED ? (
					<Iconify icon="solar:lock-password-outline" width={16} />
				) : undefined,
			},
		];
	}, [t, tenantId]);

	if (!tenantId) {
		return <View400 title="Bad Request" description="Tenant ID is required" />;
	}

	return (
		<QueryDisplay
			query={getTenantQuery}
			LoadingSlot={<TenantDetailsLayoutSkeleton />}
			ErrorSlot={({ error }) => (
				<LayoutErrorView error={error} getTenantQuery={getTenantQuery} />
			)}
		>
			{() => (
				<SidebarSettingsLayout
					items={navItems}
					outletContext={{
						tenantName: getTenantQuery.data?.name ?? '',
					}}
				/>
			)}
		</QueryDisplay>
	);
};

export default TenantDetailsLayout;

const LayoutErrorView: FC<{
	error: unknown;
	getTenantQuery: UseQueryResult<GetTenantAsStaffResult, Error>;
}> = ({ error, getTenantQuery }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);

	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return (
			<NotFoundView
				withLayout={false}
				title={capitalize(t('tenant-not-found-title'))}
				description={t('tenant-not-found-description')}
			/>
		);
	}

	return (
		<DashboardContent maxWidth="lg" compact>
			<Box sx={{ py: 10 }}>
				<ErrorContent
					title={t('tenant-details-error-title')}
					description={t('tenant-details-error-description')}
					onRetry={() => getTenantQuery.refetch()}
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
