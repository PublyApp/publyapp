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
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { usePathname } from '@/front/hooks/use-pathname';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
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
	const pathname = usePathname();
	const { tenantId } = useParams();

	const { NAV_ITEMS, ACTIONS } = useMemo(() => {
		const tenantDetailPaths = FRONT_PATH_NAMES.staff.tenants.details(tenantId);

		const NAV_ITEMS = [
			{
				label: t('general'),
				icon: <Iconify width={24} icon="solar:buildings-bold" />,
				href: tenantDetailPaths.tabs.general,
			},
			// {
			// 	label: t('billing'),
			// 	icon: <Iconify width={24} icon="solar:bill-list-bold" />,
			// 	href: tenantDetailPaths.tabs.billing,
			// },
			{
				label: t('users'),
				icon: <Iconify width={24} icon="solar:users-group-rounded-bold" />,
				href: tenantDetailPaths.tabs.users,
				action: <CreateUserButton />,
			},
			{
				label: t('profiles'),
				icon: <Iconify width={24} icon="solar:settings-bold" />,
				href: tenantDetailPaths.tabs.profiles,
				action: <CreateProfileButton />,
			},
		];

		const ACTIONS = {} as Record<string, React.ReactNode>;

		_.forEach(NAV_ITEMS, (item) => {
			if (item.action) {
				ACTIONS[item.href] = item.action;
			}
		});

		return { NAV_ITEMS, ACTIONS };
	}, [t, tenantId]);

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
				heading={t('tenant-details')}
				links={[
					{
						name: _.capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
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

const CreateUserButton = () => {
	const { t } = useTranslate();
	const openDrawer = useBoolean();

	return (
		<>
			<Button
				type="submit"
				variant="contained"
				// loading={isSubmitting}
				onClick={openDrawer.onTrue}
				startIcon={<Iconify icon="mingcute:add-line" />}
			>
				{_.capitalize(t('new-item', { item: t('user') }))}
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

const CreateProfileButton = () => {
	const { t } = useTranslate();
	const openDrawer = useBoolean();

	return (
		<>
			<Button
				type="submit"
				variant="contained"
				// loading={isSubmitting}
				onClick={openDrawer.onTrue}
				startIcon={<Iconify icon="mingcute:add-line" />}
			>
				{_.capitalize(t('new-item', { item: t('profile') }))}
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
							width: 400,
						},
					},
				}}
			>
				ADD PROFILE FORM HERE
			</Drawer>
		</>
	);
};
