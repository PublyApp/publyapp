import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import map from 'lodash/map';
import pick from 'lodash/pick';
import toStr from 'lodash/toString';
import trim from 'lodash/trim';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useMemo } from 'react';
import { useParams } from 'react-router';

import type { StaffProfileUserItem } from '@org/client-ts/src/models';
import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

import { EmptyContent } from '#app/components/empty-content/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { LabelColor } from '#app/components/label/index.ts';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getUntypedNumber } from '#app/lib/js-client/kiota-utils.ts';
import { useFindStaffProfileUsers } from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';

export const defaultStaffProfileUsersSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

export type ProfileUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	email: string;
	status: string;
};

const columnHelper = createMRTColumnHelper<ProfileUserRowData>();

export const StaffProfileUsersTable = () => {
	const { t } = useTranslate();
	const { profileId } = useParams();
	const resolvedProfileId = toStr(profileId);
	const {
		handlePaginationChange,
		handleSortingChange,
		apiVariables,
		tableState,
	} = useTableState({
		defaultSorting: defaultStaffProfileUsersSorting,
		defaultPageSize: DEFAULT_PAGE_SIZE,
	});

	const columns = useMemo(() => {
		return [
			columnHelper.accessor(
				(row) => {
					return getUserFullName(pick(row, ['firstName', 'lastName']));
				},
				{
					id: 'fullName',
					header: t('name'),
					Cell: UserCell,
					enableSorting: false,
					size: 900,
				},
			),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				size: 150,
			}),
			columnHelper.display({
				header: t('actions'),
				Cell: UserActionsCell,
				size: 150,
			}),
		];
	}, [t]);

	const usersQuery = useFindStaffProfileUsers({
		variables: {
			profileId: resolvedProfileId,
			...apiVariables,
		},
		enabled: !!resolvedProfileId,
	});

	const data = useMemo(() => {
		return map(usersQuery.data?.users, mapProfileUserRowData);
	}, [usersQuery.data]);

	const table = useMRTTable('minimal', {
		columns,
		data,
		rowCount: getUntypedNumber(usersQuery.data?.count, 0),
		manualPagination: true,
		onPaginationChange: handlePaginationChange,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: usersQuery.isPending,
		},
		renderEmptyRowsFallback: () => (
			<EmptyContent
				title={t('no-data')}
				sx={{
					minHeight: 400,
				}}
			/>
		),
		muiTablePaperProps: {
			sx: {
				flexGrow: 1,
			},
		},
	});

	return <MaterialReactTable table={table} />;
};

const mapProfileUserRowData = (
	user: StaffProfileUserItem,
): ProfileUserRowData => {
	return {
		id: toStr(user.id),
		avatarUrl: user.avatarUrl || '',
		firstName: user.firstName || '',
		lastName: user.lastName || '',
		email: user.email || '',
		status: user.status || '',
	};
};

const UserCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const userId = props.row.original.id;
	const fullName = trim(props.cell.getValue()) || t('un-named');
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
					href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
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

const StatusCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (
	props,
) => {
	const { t } = useTranslate();

	const status = props.cell.getValue();

	let tMessage: string = t('unknown-item', { item: 'status' });
	let color: LabelColor = 'default';

	if (status === USER_STATUS_ENUM.ACTIVE) {
		tMessage = t('active');
		color = 'success';
	} else if (status === USER_STATUS_ENUM.PENDING) {
		tMessage = t('pending');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.BANNED) {
		tMessage = t('banned');
		color = 'error';
	} else if (status === USER_STATUS_ENUM.SUSPENDED) {
		tMessage = t('suspended');
		color = 'warning';
	} else if (status === USER_STATUS_ENUM.INACTIVE) {
		tMessage = t('inactive');
		color = 'default';
	}

	return (
		<Label variant="soft" color={color}>
			{tMessage}
		</Label>
	);
};

const UserActionsCell: MRT_ColumnDef<ProfileUserRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const userId = props.row.original.id;

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<Tooltip title={t('view-details')} placement="top" arrow>
				<IconButton
					color="default"
					LinkComponent={RouterLink}
					href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
				>
					<Iconify icon="solar:eye-bold" />
				</IconButton>
			</Tooltip>

			<Tooltip title={t('delete')} placement="top" arrow>
				<IconButton color="default" sx={{ color: 'error.main' }}>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Tooltip>
		</Box>
	);
};
