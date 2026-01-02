import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import i18next, { type TFunction } from 'i18next';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
} from 'material-react-table';
import { useMemo } from 'react';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import type { LabelColor } from '@/front/components/label';
import { Label } from '@/front/components/label/label';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import {
	APP_NAME,
	FRONT_PATH_NAMES,
	isServer,
	USER_STATUS_ENUM,
} from '@/shared/lib/constants';
import { getUserFullName } from '@/shared/utils/user.utils';

import type { Route } from './+types/tenant-settings-members-page';

// ----------------------------------------------------------------------

type TenantMemberRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	email: string;
	profileName: string;
	status: string;
};

const columnHelper = createMRTColumnHelper<TenantMemberRowData>();

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('users'));

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

// ----------------------------------------------------------------------

const TenantSettingsMembersPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams<{ tenantId: string }>();

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(_.pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: MemberNameCell,
					enableSorting: false,
					size: 400,
				},
			),
			columnHelper.accessor('email', {
				header: t('email'),
				size: 250,
			}),
			columnHelper.accessor('profileName', {
				header: t('role'),
				Cell: RoleCell,
				size: 150,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 150,
			}),
			columnHelper.display({
				id: 'actions',
				header: t('actions'),
				Cell: MemberActionsCell,
				size: 150,
			}),
		];
	}, [t]);

	// Empty data for now - no API integration yet
	const dataTable: TenantMemberRowData[] = useMemo(() => [], []);

	const table = useMRTTable('default', {
		columns,
		data: dataTable,
		rowCount: 0,
		manualPagination: true,
		manualSorting: true,
		state: {
			density: 'compact',
			isLoading: false,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
		renderEmptyRowsFallback: () => (
			<EmptyContent
				title={t('no-data')}
				description={t('add-email-addresses-to-assign-users-to-this-profile')}
				sx={{ py: 10 }}
			/>
		),
	});

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('settings')),
						href: FRONT_PATH_NAMES.tenant(tenantId).settings.root,
					},
					{ name: _.capitalize(t('users')) },
				]}
				action={
					<Button
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
						onClick={() => {
							// TODO: Open invite member dialog
						}}
					>
						{t('add-a-user')}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

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
		</DashboardContent>
	);
};

export default TenantSettingsMembersPage;

// ----------------------------------------------------------------------

const MemberNameCell: MRT_ColumnDef<TenantMemberRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const fullName = _.trim(props.cell.getValue()) || t('un-named');
	const avatarUrl = props.row.original.avatarUrl;

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

			<Stack
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
			>
				<Box component="span">{fullName}</Box>
			</Stack>
		</Box>
	);
};

const RoleCell: MRT_ColumnDef<TenantMemberRowData, string>['Cell'] = (
	props,
) => {
	const profileName = props.cell.getValue();

	return (
		<Label variant="soft" color="info">
			{profileName || 'Member'}
		</Label>
	);
};

const StatusCell: MRT_ColumnDef<TenantMemberRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	let t_message: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		t_message = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.PENDING) {
		t_message = t('pending');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		t_message = t('banned');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		t_message = t('suspended');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.DELETED) {
		t_message = t('deleted');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		t_message = t('inactive');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{t_message}
		</Label>
	);
};

const MemberActionsCell: MRT_ColumnDef<TenantMemberRowData>['Cell'] = (
	_props,
) => {
	const { t } = useTranslate();

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip title={t('edit')} placement="top" arrow>
				<IconButton
					color="default"
					onClick={() => {
						// TODO: Open edit member dialog
					}}
				>
					<Iconify icon="solar:pen-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title={t('delete')} placement="top" arrow>
				<IconButton
					color="default"
					sx={{ color: 'error.main' }}
					onClick={() => {
						// TODO: Open remove member confirmation dialog
					}}
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>
		</Box>
	);
};
