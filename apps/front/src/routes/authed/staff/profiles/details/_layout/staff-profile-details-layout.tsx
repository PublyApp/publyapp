import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { removeLastSlash } from 'minimal-shared/utils';
import { useMemo } from 'react';
import { data, Outlet, useParams } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';
import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { usePathname } from '#app/hooks/use-pathname.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/staff-profile-details-layout';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('profile-details'));

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
	const pathname = usePathname();
	const { profileId } = useParams();

	const { NAV_ITEMS, ACTIONS } = useMemo(() => {
		const profileDetailPaths =
			FRONT_PATH_NAMES.staff.profiles.details(profileId);

		const NAV_ITEMS = [
			{
				label: t('basics-and-permissions'),
				icon: <Iconify width={24} icon="solar:settings-bold" />,
				href: profileDetailPaths.tabs.basicsAndPermissions,
			},
			{
				label: t('users'),
				icon: <Iconify width={24} icon="solar:users-group-rounded-bold" />,
				href: profileDetailPaths.tabs.users,
				action: <AddUserButton />,
			},
		];

		const ACTIONS = {} as Record<string, React.ReactNode>;

		_.forEach(NAV_ITEMS, (item) => {
			if (item.action) {
				ACTIONS[item.href] = item.action;
			}
		});

		return { NAV_ITEMS, ACTIONS };
	}, [t, profileId]);

	const tabValue = useMemo(() => {
		const value = removeLastSlash(pathname);
		return value;
	}, [pathname]);

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={t('profile-details')}
				links={[
					{
						name: _.capitalize(t('profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{ name: t('details') },
				]}
				sx={{ mb: 3 }}
				action={ACTIONS[tabValue] || null}
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

const AddUserButton = () => {
	const { t } = useTranslate();
	const openDrawer = useBoolean();

	return (
		<>
			<Button
				type="submit"
				variant="contained"
				onClick={openDrawer.onTrue}
				startIcon={<Iconify width={16} icon="mingcute:add-line" />}
			>
				{_.capitalize(t('assign-user'))}
			</Button>
			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => {
					return {
						zIndex: theme.zIndex.modal + 1,
					};
				}}
				slotProps={{
					paper: {
						sx: {
							width: 720,
						},
					},
				}}
			>
				ADD USER FORM HERE
			</Drawer>
		</>
	);
};
