import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import _ from 'lodash';
import capitalize from 'lodash/capitalize';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
	type MRT_SortingState,
} from 'material-react-table';
import { useBoolean } from 'minimal-shared/hooks';
import { useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router';

import {
	DEFAULT_PAGE_SIZE,
	FRONT_PATH_NAMES,
	USER_STATUS_ENUM,
} from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';
import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { EmptyContent } from '#app/components/empty-content/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { LabelColor } from '#app/components/label/index.ts';
import { Label } from '#app/components/label/label.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTableState } from '#app/hooks/use-table-state.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import type { StaffProfileDetailsOutletContext } from '../_layout/staff-profile-details-layout';

// Type definition for users assigned to this profile
export type ProfileUserRowData = {
	id: string;
	avatarUrl: string;
	firstName: string;
	lastName: string;
	email: string;
	status: string;
};

const columnHelper = createMRTColumnHelper<ProfileUserRowData>();

const defaultSorting: MRT_SortingState[number] = {
	desc: true,
	id: 'created_at',
};

const StaffProfileDetailsUsersTabPage = () => {
	const { t } = useTranslate();
	const { profileId } = useParams();
	const { profileName } = useOutletContext<StaffProfileDetailsOutletContext>();
	const openDrawer = useBoolean();

	const { handlePaginationChange, handleSortingChange, tableState } =
		useTableState({
			defaultSorting,
			defaultPageSize: DEFAULT_PAGE_SIZE,
		});

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

	// Empty data for now - will be replaced with API integration later
	const dataTable: ProfileUserRowData[] = useMemo(() => {
		return [];
	}, []);

	const table = useMRTTable('minimal', {
		columns,
		data: dataTable,
		rowCount: 0,
		manualPagination: true,
		onPaginationChange: handlePaginationChange,
		manualSorting: true,
		onSortingChange: handleSortingChange,
		state: {
			...tableState,
			density: 'compact',
			isLoading: false,
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

	return (
		<Box
			sx={{
				flexGrow: 1,
				display: 'flex',
				flexDirection: 'column',
				border: 'none',
			}}
		>
			<CustomBreadcrumbs
				heading={profileName}
				links={[
					{
						name: capitalize(t('profiles')),
						href: FRONT_PATH_NAMES.staff.profiles.root,
					},
					{
						name: profileName,
						href: FRONT_PATH_NAMES.staff.profiles.details(profileId).root,
					},
					{
						name: t('users'),
					},
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
				action={
					<Button
						variant="contained"
						onClick={openDrawer.onTrue}
						startIcon={<Iconify width={16} icon="mingcute:add-line" />}
					>
						{capitalize(t('assign-user'))}
					</Button>
				}
			/>

			<MaterialReactTable table={table} />

			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => ({
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					paper: {
						sx: {
							width: 720,
						},
					},
				}}
			>
				<Box sx={{ p: 3 }}>{t('coming-soon')}</Box>
			</Drawer>
		</Box>
	);
};

export default StaffProfileDetailsUsersTabPage;

// ----------------------------------------------------------------------

const UserCell: MRT_ColumnDef<ProfileUserRowData, string>['Cell'] = (props) => {
	const { t } = useTranslate();

	const userId = props.row.original.id;
	const fullName = _.trim(props.cell.getValue()) || t('un-named');
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
