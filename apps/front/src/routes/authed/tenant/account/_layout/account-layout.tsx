import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo } from 'react';
import { data } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';
import type { SettingsNavItem } from '@/front/components/settings/settings-nav';
import { SidebarSettingsLayout } from '@/front/components/settings/sidebar-settings-layout';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { useTranslate } from '@/front/hooks/use-translate';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';

import type { Route } from './+types/account-layout';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('account-settings'));

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

const AccountLayout = () => {
	const { t } = useTranslate();
	const tenantId = useTenantParam();

	const navItems: SettingsNavItem[] = useMemo(() => {
		const paths = FRONT_PATH_NAMES.tenant(tenantId).account;

		return [
			{ label: t('profile'), href: paths.root },
			{ label: t('security'), href: paths.security },
			{ label: t('notifications'), href: paths.notifications },
		];
	}, [t, tenantId]);

	return <SidebarSettingsLayout items={navItems} />;
};

export default AccountLayout;
