import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { nanoid } from 'nanoid';
import { useMemo, useState } from 'react';

import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import type { LabelColor } from '@/front/components/label/types';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTableState } from '@/front/hooks/use-table-state';
import { useTranslate } from '@/front/hooks/use-translate';
import { getUntypedNumber } from '@/front/lib/js-client/kiota-utils';
import {
	useFindTenants,
	useReactivateTenant,
	useSuspendTenant,
} from '@/front/lib/react-query/features/staff/staff-tenant.hooks';
import type { TenantAsStaffItem } from '@/js-client/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	TENANT_STATUS_ENUM,
	voidFunction,
} from '@/shared/lib/constants';

export type TenantRowData = {
	id: string;
	name: string;
	logoUrl: string;
	usersCount: number;
	maxUsers: number;
	status: string;
	isSuspended: boolean;
};

const TenantRowDataMapper = (tenant: TenantAsStaffItem): TenantRowData => {
	return {
		id: tenant.id || nanoid(),
		name: tenant.name || '-',
		logoUrl: tenant.logoUrl || '-',
		usersCount: getUntypedNumber(tenant.usersCount, 0),
		maxUsers: getUntypedNumber(tenant.maxUsers, 0),
		status: tenant.status || '-',
		isSuspended: tenant.isSuspended ?? false,
	};
};

const columnHelper = createMRTColumnHelper<TenantRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'createdAt',
};

const TenantsTable = () => {
	const { t } = useTranslate();

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('name', {
				header: t('name'),
				Cell: TenantCell,
				size: 300,
			}),
			columnHelper.accessor('usersCount', {
				header: t('users'),
				Cell: UsersCountCell,
				size: 70,
			}),
			// columnHelper.accessor('pricingPlan', {
			// 	header: t('pricing-plan'),
			// 	Cell: (props) => {
			// 		return props.cell.getValue();
			// 	},
			// 	size: 70,
			// }),
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

	// Use the custom table state hook
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
	} = useTableState({
		defaultSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
	});

	const { data, isPending } = useFindTenants({
		variables: apiVariables,
	});

	const dataTable = useMemo(() => {
		return _.map(data?.tenants, (tenant) => TenantRowDataMapper(tenant));
	}, [data]);

	const table = useMRTTable('minimal', {
		columns,
		data: dataTable,
		rowCount: getUntypedNumber(data?.count, 0),
		manualPagination: true,
		onPaginationChange: handlePaginationChange,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: isPending,
		},
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return (
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
	);
};

export default TenantsTable;

// ----------------------------------------------------------------------

const TenantCell: MRT_ColumnDef<TenantRowData, string>['Cell'] = (props) => {
	// const logoUrl = props.row.original.logoUrl;
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
				// src={logoUrl}
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

	let color: LabelColor = 'default';

	if (status === TENANT_STATUS_ENUM.ACTIVE) {
		color = 'success';
	} else if (status === TENANT_STATUS_ENUM.PENDING) {
		color = 'warning';
	} else if (status === TENANT_STATUS_ENUM.SUSPENDED) {
		color = 'error';
	} else if (status === TENANT_STATUS_ENUM.ARCHIVED) {
		color = 'warning';
	}

	return (
		<Label variant="soft" color={color}>
			{status || _.toLower(t('unknown-item', { item: 'status' }))}
		</Label>
	);
};

const UsersCountCell: MRT_ColumnDef<TenantRowData, number>['Cell'] = (
	props,
) => {
	return (
		<>
			{props.cell.getValue()} / {props.row.original.maxUsers}
		</>
	);
};

const TenantActionsCell: MRT_ColumnDef<TenantRowData>['Cell'] = (props) => {
	const tenantId = props.row.original.id;
	const tenantName = props.row.original.name;
	const status = props.row.original.status;
	const isSuspended = props.row.original.isSuspended;
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);

	const { mutate: suspendTenant, isPending: isSuspending } = useSuspendTenant({
		meta: { successMessage: 'tenant-suspended-success' },
		onSuccess: () => {
			setSuspendDialogOpen(false);
			queryClient.invalidateQueries({
				queryKey: useFindTenants.getKey(),
			});
		},
	});

	const { mutate: reactivateTenant, isPending: isReactivating } =
		useReactivateTenant({
			meta: { successMessage: 'tenant-reactivated-success' },
			onSuccess: () => {
				setReactivateDialogOpen(false);
				queryClient.invalidateQueries({
					queryKey: useFindTenants.getKey(),
				});
			},
		});

	const handleSuspend = () => {
		suspendTenant({ tenantId });
	};

	const handleReactivate = () => {
		reactivateTenant({ tenantId });
	};

	// Show suspend button only when tenant is Active and not already suspended
	const canSuspend = status === TENANT_STATUS_ENUM.ACTIVE && !isSuspended;
	// Show reactivate button only when tenant is suspended
	const canReactivate = isSuspended;

	return (
		<>
			<Box sx={{ display: 'flex', alignItems: 'center' }}>
				<Tooltip title={t('view-details')} placement="top" arrow>
					<IconButton
						color={'default'}
						LinkComponent={RouterLink}
						href={FRONT_PATH_NAMES.staff.tenants.details(tenantId).root}
					>
						<Iconify icon="solar:eye-bold" />
					</IconButton>
				</Tooltip>

				{canSuspend && (
					<Tooltip title={t('suspend')} placement="top" arrow>
						<IconButton
							color={'default'}
							onClick={() => setSuspendDialogOpen(true)}
							sx={{ color: 'warning.main' }}
						>
							<Iconify icon="solar:forbidden-circle-bold" />
						</IconButton>
					</Tooltip>
				)}

				{canReactivate && (
					<Tooltip title={t('reactivate')} placement="top" arrow>
						<IconButton
							color={'default'}
							onClick={() => setReactivateDialogOpen(true)}
							sx={{ color: 'success.main' }}
						>
							<Iconify icon="solar:play-circle-bold" />
						</IconButton>
					</Tooltip>
				)}

				<Tooltip title="Delete" placement="top" arrow>
					<IconButton
						color={'default'}
						onClick={voidFunction}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:trash-bin-trash-bold" />
					</IconButton>
				</Tooltip>
			</Box>

			<ConfirmDialog
				open={suspendDialogOpen}
				onClose={() => setSuspendDialogOpen(false)}
				title={t('suspend-tenant')}
				content={t('suspend-tenant-confirm', { name: tenantName })}
				action={
					<Button
						variant="contained"
						color="warning"
						onClick={handleSuspend}
						disabled={isSuspending}
					>
						{t('suspend')}
					</Button>
				}
			/>

			<ConfirmDialog
				open={reactivateDialogOpen}
				onClose={() => setReactivateDialogOpen(false)}
				title={t('reactivate-tenant')}
				content={t('reactivate-tenant-confirm', { name: tenantName })}
				action={
					<Button
						variant="contained"
						color="success"
						onClick={handleReactivate}
						disabled={isReactivating}
					>
						{t('reactivate')}
					</Button>
				}
			/>
		</>
	);
};
