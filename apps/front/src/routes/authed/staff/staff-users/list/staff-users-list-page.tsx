import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data } from 'react-router';

<<<<<<<< HEAD:apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx
import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
========
>>>>>>>> 9e8689750 (refactor(front): rename staff-member references to staff-user):apps/front/src/routes/authed/staff/staff-users/list/staff-users-list-page.tsx
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
<<<<<<<< HEAD:apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx

import type { Route } from './+types/staff-audit-logs-list-page';
import StaffAuditLogsTable from './parts/staff-audit-logs-table';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('audit-logs'));
========
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/staff-users-list-page';
import StaffUsersTable from './parts/staff-users-table';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(
		t('list-of-items', { items: _.toLower(t('staff-users')) }),
	);
>>>>>>>> 9e8689750 (refactor(front): rename staff-member references to staff-user):apps/front/src/routes/authed/staff/staff-users/list/staff-users-list-page.tsx

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

<<<<<<<< HEAD:apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx
const StaffAuditLogsListPage = () => {
========
const StaffUsersListPage = () => {
>>>>>>>> 9e8689750 (refactor(front): rename staff-member references to staff-user):apps/front/src/routes/authed/staff/staff-users/list/staff-users-list-page.tsx
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
<<<<<<<< HEAD:apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx
						name: _.capitalize(t('audit-logs')),
						href: FRONT_PATH_NAMES.staff.auditLogs.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
			<StaffAuditLogsTable />
========
						name: _.capitalize(t('staff-users')),
						href: FRONT_PATH_NAMES.staff.staffUsers.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.staff.staffUsers.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{t('new-item', { item: _.toLower(t('staff-user')) })}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<StaffUsersTable />
>>>>>>>> 9e8689750 (refactor(front): rename staff-member references to staff-user):apps/front/src/routes/authed/staff/staff-users/list/staff-users-list-page.tsx
		</DashboardContent>
	);
};

<<<<<<<< HEAD:apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx
export default StaffAuditLogsListPage;
========
export default StaffUsersListPage;
>>>>>>>> 9e8689750 (refactor(front): rename staff-member references to staff-user):apps/front/src/routes/authed/staff/staff-users/list/staff-users-list-page.tsx
