import Box from '@mui/material/Box';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo } from 'react';
import { data, Outlet } from 'react-router';

import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import {
	SettingsNav,
	type SettingsNavItem,
} from '../../settings/_layout/settings-nav';
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

	return (
		<DashboardContent maxWidth="lg" compact>
			<Box
				sx={{
					display: 'flex',
					gap: 4,
					flexDirection: { xs: 'column', md: 'row' },
				}}
			>
				{/* Left Navigation */}
				<Box
					sx={{
						display: { xs: 'none', md: 'block' },
						flexShrink: 0,
						width: 200,
						position: 'sticky',
						top: 80,
						alignSelf: 'flex-start',
						maxHeight: 'calc(100vh - 100px)',
						overflowY: 'auto',
					}}
				>
					<SettingsNav items={navItems} />
				</Box>

				{/* Main Content */}
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Outlet />
				</Box>
			</Box>
		</DashboardContent>
	);
};

export default AccountLayout;
