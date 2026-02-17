import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import type { SettingsNavItem } from '@/front/components/settings/settings-nav';
import { SidebarSettingsLayout } from '@/front/components/settings/sidebar-settings-layout';
import { useTranslate } from '@/front/hooks/use-translate';
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

	const breadcrumbs = (
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
	);

	return <SidebarSettingsLayout items={navItems} breadcrumbs={breadcrumbs} />;
};

export default TenantDetailsLayout;
