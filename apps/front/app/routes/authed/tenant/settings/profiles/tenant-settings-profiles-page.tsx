import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import { isServer } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
} from 'material-react-table';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';

import type { Route } from './+types/tenant-settings-profiles-page';

// Enable dayjs relative time plugin
dayjs.extend(relativeTime);

// Row Data Type
export type TenantProfileRowData = {
	id: string;
	name: string;
	description: string | null;
	usersCount: number;
	createdAt: string;
};

// Column Helper
const columnHelper = createMRTColumnHelper<TenantProfileRowData>();

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('profiles'));

	if (seo) {
		str = `${str} | Tenant Settings - ${APP_NAME}`;
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

const TenantSettingsProfilesPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams<{ tenantId: string }>();

	// Column definitions
	const columns = useMemo(() => {
		return [
			columnHelper.accessor('name', {
				header: _.capitalize(t('name')),
				size: 200,
			}),
			columnHelper.accessor('description', {
				header: _.capitalize(t('description')),
				size: 300,
			}),
			columnHelper.accessor('usersCount', {
				header: _.capitalize(t('users')),
				size: 100,
				muiTableHeadCellProps: {
					align: 'center',
				},
				muiTableBodyCellProps: {
					align: 'center',
				},
			}),
			columnHelper.accessor('createdAt', {
				header: _.capitalize(t('created')),
				size: 150,
			}),
			columnHelper.display({
				id: 'actions',
				header: _.capitalize(t('actions')),
				size: 100,
			}),
		];
	}, [t]);

	// Empty data for now - no API integration yet
	const dataTable: TenantProfileRowData[] = [];

	// Table configuration
	const table = useMRTTable('minimal-cursor', {
		columns,
		data: dataTable,
		state: {
			density: 'compact',
			isLoading: false,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('dashboard')),
						href: FRONT_PATH_NAMES.tenant(tenantId).root,
					},
					{
						name: _.capitalize(t('settings')),
					},
					{ name: _.capitalize(t('profiles')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.tenant(tenantId).settings.profiles.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{t('new-item', { item: _.toLower(t('profile')) })}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			{/* Empty state - no API integration yet */}
			{dataTable.length === 0 ? (
				<Card
					sx={{
						flexGrow: 1,
						display: 'flex',
						flexDirection: 'column',
						minHeight: 400,
					}}
				>
					<EmptyContent
						filled
						title={t('no-items-found', { item: t('profiles') })}
						description={t('create-first-item', { item: t('profile') })}
						sx={{ py: 10 }}
					/>
				</Card>
			) : (
				<Box
					sx={{
						flexGrow: 1,
						display: 'flex',
						flexDirection: 'column',
						border: 'none',
					}}
				>
					<MaterialReactTable table={table} />
				</Box>
			)}
		</DashboardContent>
	);
};

export default TenantSettingsProfilesPage;
