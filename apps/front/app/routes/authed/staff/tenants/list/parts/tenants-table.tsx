import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_PaginationState,
} from 'material-react-table';
import { useMemo, useState } from 'react';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTranslate } from '@/front/hooks/use-translate';
import { DEFAULT_PAGE_SIZE, FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { mockDataTenants } from './mock-data-tenants';

export type TenantRowData = {
	id: string;
	name: string;
	logoUrl: string;
	users: { count: number; maxAllowed: number };
	status: string; // 'active' | 'archived';
	pricingPlan: string; // 'free' | 'bronze' | 'silver '| 'gold' | 'platinum'; //TODO: add plan enum
};

const data = mockDataTenants;

const columnHelper = createMRTColumnHelper<TenantRowData>();

const TenantsTable = () => {
	const { t } = useTranslate();

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('name', {
				header: t('name'),
				Cell: TenantCell,
				// grow: 1,
				size: 300,
			}),
			columnHelper.accessor('users.count', {
				header: t('users'),
				Cell: (props) => {
					return (
						<>
							{props.cell.getValue()} / {props.row.original.users.maxAllowed}
						</>
					);
				},
				size: 70,
			}),
			columnHelper.accessor('pricingPlan', {
				header: t('pricing-plan'),
				Cell: (props) => {
					return props.cell.getValue();
				},
				size: 70,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 70,
			}),
			columnHelper.display({
				header: 'Actions',
				Cell: TenantActionsCell,
				size: 70,
			}),
		];
	}, [t]);

	const [pagination, setPagination] = useState<MRT_PaginationState>({
		pageIndex: 0,
		pageSize: DEFAULT_PAGE_SIZE, //customize the default page size
	});

	const slicedData = useMemo(() => {
		const startIndex = pagination.pageIndex * pagination.pageSize;
		const endIndex = startIndex + pagination.pageSize;
		return _.slice(data, startIndex, endIndex);
	}, [pagination]);

	const table = useMRTTable('default', {
		columns,
		data: slicedData,
		manualPagination: true,
		rowCount: data.length,
		onPaginationChange: setPagination,
		state: {
			pagination,
			density: 'compact',
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
		<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
			<MaterialReactTable table={table} />
		</Card>
	);
};

export default TenantsTable;

// ----------------------------------------------------------------------

const TenantCell: MRT_ColumnDef<TenantRowData, string>['Cell'] = (props) => {
	const logoUrl = props.row.original.logoUrl;
	const name = props.row.original.name;
	const href = FRONT_PATH_NAMES.staff.tenants.details(
		props.row.original.id,
	).root;

	return (
		<Box
			sx={{
				py: 1,
				gap: 2,
				width: 1,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Avatar
				alt={name}
				src={logoUrl}
				variant="rounded"
				sx={{ width: 46, height: 46 }}
			/>

			<ListItemText
				primary={
					<Link component={RouterLink} href={href} color="inherit">
						{name}
					</Link>
				}
				secondary={props.row.original.id}
				slotProps={{
					primary: { noWrap: true },
					secondary: { sx: { color: 'text.disabled' } },
				}}
			/>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<TenantRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	return (
		<Label
			variant="soft"
			color={
				(status === 'active' && 'success') ||
				(status === 'archived' && 'warning') ||
				'default'
			}
		>
			{status || _.toLower(t('unknown-item', { item: 'status' }))}
		</Label>
	);
};

const TenantActionsCell: MRT_ColumnDef<TenantRowData>['Cell'] = (props) => {
	const tenantId = props.row.original.id;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip title="View details" placement="top" arrow>
				<IconButton
					color={/* quickEditForm.value ? 'inherit' : 'default' */ 'default'}
					// onClick={/* quickEditForm.onTrue */ () => {}}
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.tenants.details(tenantId).root}
				>
					<Iconify icon="solar:eye-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title="Quick Edit" placement="top" arrow>
				<IconButton
					color={/* quickEditForm.value ? 'inherit' : 'default' */ 'default'}
					onClick={/* quickEditForm.onTrue */ () => {}}
				>
					<Iconify icon="solar:pen-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title="Delete" placement="top" arrow>
				<IconButton
					color={/* quickEditForm.value ? 'inherit' : 'default' */ 'default'}
					onClick={/* quickEditForm.onTrue */ () => {}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>

			{/* <IconButton
              color={menuActions.open ? 'inherit' : 'default'}
              onClick={menuActions.onOpen}
            >
              <Iconify icon="eva:more-vertical-fill" />
            </IconButton> */}
		</Box>
	);
};
