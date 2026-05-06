import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import capitalize from 'lodash/capitalize';
import get from 'lodash/get';
import { data } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import type { Route } from './+types/staff-audit-logs-list-page';
import StaffAuditLogsTable from './_parts/staff-audit-logs-table';

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = capitalize(t('audit-logs'));

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

const StaffAuditLogsListPage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: capitalize(t('audit-logs')),
						href: FRONT_PATH_NAMES.staff.auditLogs.root,
					},
					{ name: capitalize(t('list')) },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>
			<StaffAuditLogsTable />
		</DashboardContent>
	);
};

export default StaffAuditLogsListPage;
