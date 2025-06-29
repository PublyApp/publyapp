import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTranslate } from '@/front/hooks/use-translate';
import { useFindStaffMember } from '@/front/lib/react-query/features/staff-member/staff-member.hooks';
import { DEFAULT_PAGE_SIZE, FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getUserFullName } from '@/shared/utils/user.utils';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import type { OnChangeFn } from '@tanstack/table-core';
import _ from 'lodash';
import {
	type MRT_ColumnDef,
	type MRT_PaginationState,
	type MRT_SortingState,
	MaterialReactTable,
	createMRTColumnHelper,
} from 'material-react-table';
import { parseAsJson, useQueryState } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

export type StaffMemberRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	role: string;
	status: string;
	email: string;
};

const columnHelper = createMRTColumnHelper<StaffMemberRowData>();

const staffMembersTable = () => {
	const { t } = useTranslate();

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(_.pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: UserCell,
					// grow: 1,
					size: 300,
				},
			),
			columnHelper.accessor('role', {
				header: t('role'),
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
				Cell: UserActionsCell,
				size: 70,
			}),
		];
	}, [t]);

	const [pagination, setPagination] = useState<MRT_PaginationState>({
		pageIndex: 0,
		pageSize: DEFAULT_PAGE_SIZE, //customize the default page size
	});

	const schema = useMemo(() => {
		return z.object({
			id: z.string(),
			desc: z.boolean(),
		});
	}, []);

	const [sorting, setSorting] = useQueryState(
		'staff-members-table-sorting',
		parseAsJson<MRT_SortingState[number]>(schema.parse).withDefault({
			desc: true,
			id: 'createdAt',
		}),
	);

	const handleSortingChange = useCallback<OnChangeFn<MRT_SortingState>>(
		(updaterOrValue) => {
			if (_.isFunction(updaterOrValue)) {
				setSorting((prev) => {
					const _sorting = updaterOrValue([prev]);
					return _sorting[0];
				});
			} else {
				setSorting(sorting);
			}
		},
		[setSorting, sorting],
	);

	const { data: staffMembers, isPending } = useFindStaffMember({
		variables: {
			limit: pagination.pageSize,
			sort: {
				id: sorting.id,
				order: sorting.desc === false ? 'asc' : 'desc',
			},
		},
	});

	const data: StaffMemberRowData[] = useMemo(() => {
		if (!staffMembers) return [];

		return _.map(staffMembers, (staffMember) => {
			return {
				id: staffMember.objectId,
				avatarUrl: staffMember.avatarUrl || '',
				firstName: staffMember.firstName || '',
				lastName: staffMember.lastName || '',
				role: staffMember.roleData?.role || '',
				status: staffMember.status || '',
				email: staffMember.email || '',
			};
		});
	}, [staffMembers]);

	const table = useMRTTable('default', {
		columns,
		data: data,
		rowCount: data.length,
		manualPagination: true,
		onPaginationChange: setPagination,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			pagination,
			density: 'comfortable',
			sorting: [sorting],
			isLoading: isPending,
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

export default staffMembersTable;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<StaffMemberRowData, string>['Cell'] = (props) => {
	const userId = props.row.original.id;
	const fullName = props.cell.getValue();
	const avatarUrl = props.row.original.avatarUrl;
	const email = props.row.original.email;

	return (
		<Box sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
			<Avatar alt={fullName} src={avatarUrl} />

			<Stack
				sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}
			>
				<Link
					component={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffMembers.details(userId)}
					color="inherit"
					sx={{ cursor: 'pointer' }}
				>
					{fullName}
				</Link>
				<Box component="span" sx={{ color: 'text.disabled' }}>
					{email}
				</Box>
			</Stack>
		</Box>
	);
};

const StatusCell: MRT_ColumnDef<StaffMemberRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	return (
		<Label
			variant="soft"
			color={
				(status === 'active' && 'success') ||
				(status === 'pending' && 'warning') ||
				(status === 'banned' && 'error') ||
				'default'
			}
		>
			{status || _.toLower(t('unknown-item', { item: 'status' }))}
		</Label>
	);
};

const UserActionsCell: MRT_ColumnDef<StaffMemberRowData>['Cell'] = (props) => {
	const userId = props.row.original.id;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip title="View details" placement="top" arrow>
				<IconButton
					color={/* quickEditForm.value ? 'inherit' : 'default' */ 'default'}
					// onClick={/* quickEditForm.onTrue */ () => {}}
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffMembers.details(userId)}
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
