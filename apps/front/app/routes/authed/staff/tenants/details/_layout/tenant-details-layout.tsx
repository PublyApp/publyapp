import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { removeLastSlash } from 'minimal-shared/utils';
import { useMemo } from 'react';
import { Outlet, useParams } from 'react-router';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { usePathname } from '@/front/hooks/use-pathname';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';
import { getLastPath } from '@/shared/utils/string.utils';
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
		return _.get(args.data, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

const IDENTIFIER = ':tenantId';

const tenantDetailPaths = FRONT_PATH_NAMES.staff.tenants.details(IDENTIFIER);

const TenantDetailsLayout = () => {
	const { t } = useTranslate();
	const pathname = usePathname();
	const { tenantId } = useParams();

	const NAV_ITEMS = useMemo(() => {
		return [
			{
				label: t('general'),
				icon: <Iconify width={24} icon="solar:home-angle-bold-duotone" />,
				href: getLastPath(tenantDetailPaths.tabs.general),
			},
			{
				label: t('users'),
				icon: (
					<Iconify width={24} icon="solar:users-group-rounded-bold-duotone" />
				),
				href: getLastPath(tenantDetailPaths.tabs.users),
			},
			{
				label: t('billing'),
				icon: <Iconify width={24} icon="solar:bill-list-bold" />,
				href: getLastPath(tenantDetailPaths.tabs.billing),
			},
			{
				label: t('profiles'),
				icon: <Iconify width={24} icon="solar:settings-bold-duotone" />,
				href: getLastPath(tenantDetailPaths.tabs.profiles),
			},
		];
	}, [t]);

	const tabValue = useMemo(() => {
		let value = removeLastSlash(getLastPath(pathname));

		if (value === tenantId) {
			value = IDENTIFIER;
		}

		return value;
	}, [pathname, tenantId]);

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={t('tenant-details')}
				links={[
					{
						name: _.capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: t('details') },
				]}
				sx={{ mb: 3 }}
			/>

			<Tabs value={tabValue} sx={{ mb: { xs: 3, md: 5 } }}>
				{NAV_ITEMS.map((tab) => (
					<Tab
						component={RouterLink}
						key={tab.href}
						label={tab.label}
						icon={tab.icon}
						value={tab.href}
						href={tab.href}
					/>
				))}
			</Tabs>

			<Outlet />
		</DashboardContent>
	);
};

export default TenantDetailsLayout;
