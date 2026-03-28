import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';
import type { SettingsNavItem } from '#app/components/settings/settings-nav.tsx';
import { SidebarSettingsLayout } from '#app/components/settings/sidebar-settings-layout.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

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
