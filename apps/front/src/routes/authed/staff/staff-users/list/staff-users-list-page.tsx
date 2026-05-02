import Button from '@mui/material/Button';
import i18next, { type TFunction } from 'i18next';
import get from 'lodash/get';
import toLower from 'lodash/toLower';
import { data } from 'react-router';

import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
} from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/staff-users-list-page';
import StaffUsersTable from './parts/staff-users-table';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str = t('users');

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

const StaffUsersListPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: t('staff'),
						href: FRONT_PATH_NAMES.staff.staffUsers.root,
					},
					{ name: t('users') },
				]}
				action={
					<Button
						variant="contained"
						startIcon={
							<Iconify
								icon="mingcute:add-line"
								sx={{ width: 16, height: 16 }}
							/>
						}
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.invitations.new}
					>
						{t('new-item', { item: toLower(t('user')) })}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<StaffUsersTable />
		</DashboardContent>
	);
};

export default StaffUsersListPage;
