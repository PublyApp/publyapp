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
			ErrorSlot={LayoutErrorView}
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
	query: UseQueryResult<GetTenantAsStaffResult, Error>;
}> = ({ error, query }) => {
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
					onRetry={() => query.refetch()}
				/>
			</Box>
		</DashboardContent>
	);
};

const TenantDetailsNavItemSkeleton = ({
	width,
	locked = false,
}: {
	width: string;
	locked?: boolean;
}) => (
	<Box
		sx={{
			display: 'flex',
			alignItems: 'center',
			gap: 1.25,
			px: 1,
			py: 0.75,
			borderRadius: 1,
		}}
	>
		<Skeleton variant="circular" width={18} height={18} />
		<Skeleton variant="rounded" width={width} height={14} />
		{locked ? (
			<Skeleton
				variant="circular"
				width={14}
				height={14}
				sx={{ ml: 'auto', flexShrink: 0 }}
			/>
		) : null}
	</Box>
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
			<Box
				sx={{
					display: { xs: 'none', md: 'block' },
					flexShrink: 0,
					width: 220,
				}}
			>
				<Stack spacing={2}>
					<Box sx={{ px: 1 }}>
						<Skeleton variant="text" width="56%" height={16} sx={{ mb: 0.5 }} />
						<Skeleton variant="text" width="88%" height={28} />
						<Skeleton variant="text" width="72%" height={16} />
					</Box>

					<Box sx={{ display: 'grid', gap: 0.5 }}>
						<TenantDetailsNavItemSkeleton width="48%" />
						<TenantDetailsNavItemSkeleton width="34%" />
						<TenantDetailsNavItemSkeleton width="46%" />
						<TenantDetailsNavItemSkeleton width="40%" />
						<TenantDetailsNavItemSkeleton width="38%" locked />
					</Box>
				</Stack>
			</Box>

			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Box sx={{ mb: { xs: 3, md: 5 } }}>
					<Skeleton variant="text" width="36%" height={38} />
					<Skeleton variant="text" width="54%" height={18} />
				</Box>

				<Box
					sx={{
						display: 'grid',
						gap: 3,
						gridTemplateColumns: {
							xs: '1fr',
							lg: 'minmax(0, 300px) minmax(0, 1fr)',
						},
					}}
				>
					<Box sx={{ display: 'grid', gap: 3 }}>
						<Skeleton variant="rounded" height={360} sx={{ borderRadius: 2 }} />
					</Box>

					<Box sx={{ display: 'grid', gap: 3 }}>
						<Skeleton variant="rounded" height={264} sx={{ borderRadius: 2 }} />
						<Skeleton variant="rounded" height={176} sx={{ borderRadius: 2 }} />
					</Box>
				</Box>
			</Box>
		</Box>
	</DashboardContent>
);
