import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import type { SettingsNavItem } from '@/front/components/settings/settings-nav';
import { SidebarSettingsLayout } from '@/front/components/settings/sidebar-settings-layout';
import { useTranslate } from '@/front/hooks/use-translate';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/settings-layout';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('organization-settings'));

	if (seo) {
		str = `${str} | ${APP_NAME}`;
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

const SettingsLayout = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();

	const navItems: SettingsNavItem[] = useMemo(() => {
		const paths = FRONT_PATH_NAMES.tenant(tenantId).settings;

		return [
			{ label: t('general'), href: paths.root },
			{ label: t('members'), href: paths.members },
			{ label: t('workspaces'), href: paths.workspaces },
			{ label: t('roles-and-permissions'), href: paths.roles },
			{ label: t('security'), href: paths.security },
			{ label: t('integrations'), href: paths.integrations },
			{ label: t('billing'), href: paths.billing },
		];
	}, [t, tenantId]);

	return <SidebarSettingsLayout items={navItems} />;
};

export default SettingsLayout;
