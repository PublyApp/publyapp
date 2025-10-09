import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { darken, useColorScheme, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
} from 'material-react-table';
import { useBoolean } from 'minimal-shared/hooks';
import { nanoid } from 'nanoid';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import type { TenantProfile } from '@/front/_mock/_tenant-profiles';
import { ConfirmDialog } from '@/front/components/custom-dialog/confirm-dialog';
import { Iconify } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { useMRTTable } from '@/front/hooks/use-mrt-table';
import { useTranslate } from '@/front/hooks/use-translate';
import { useFindTenantProfiles } from '@/front/lib/react-query/features/staff/staff-tenant.hooks';
import { TENANT_PROFILES_PERMISSIONS_ENUM } from '@/shared/lib/constants';

type TenantProfileRowData = Record<string, unknown> & { permission: string };

const columnHelper = createMRTColumnHelper<TenantProfileRowData>();

const commonColumns = [
	columnHelper.accessor('permission', {
		header: 'Permission',
		// Header: () => {
		// 	return <Typography>Permission</Typography>;
		// },
		Cell: ({ cell }) => {
			return <>{cell.getValue()}</>;
		},
		size: 250, // ! no choice but to set a fixed size
	}),
];

const placeholderColumns = [
	...commonColumns,
	...Array.from({ length: 10 }, (_, index) => {
		return columnHelper.accessor(`placeholder-${index}`, {
			id: `placeholder-${index}`,
			header: `Placeholder ${index}`,
			Header: () => {
				return <Skeleton variant="text" width="100%" height="100%" />;
			},
			Cell: () => {
				return <Skeleton variant="text" width="100%" height="100%" />;
			},
		});
	}),
];

const ALL_PERMISSIONS = _.values(TENANT_PROFILES_PERMISSIONS_ENUM);

const rows = _.map(ALL_PERMISSIONS, (permission: string) => {
	return {
		permission,
	};
});

const TenantProfilesTable = () => {
	const { tenantId } = useParams();
	const { data: profiles, isPending } = useFindTenantProfiles({
		variables: {
			tenantId: _.toString(tenantId),
		},
		enabled: !!tenantId,
	});

	const profilesMap = useMemo(() => {
		const map = new Map<string, TenantProfile>();

		_.forEach(profiles, (profile) => {
			map.set(profile.objectId, profile);
		});

		return map;
	}, [profiles]);

	const theme = useTheme();

	const columns = useMemo(() => {
		const columnsDefinition = [...commonColumns];

		profilesMap.forEach((profile) => {
			columnsDefinition.push(
				columnHelper.accessor(`${profile.objectId}-${nanoid()}`, {
					header: profile.name,
					Header: ProfileHeader,
					size: 190,
					Cell: ({ row }) => {
						const isActive = _.get(
							profilesMap.get(profile.objectId),
							`permissions.${row.original.permission}`,
							false,
						);

						return <Checkbox checked={isActive} />;
					},
				}),
			);
		});
		return columnsDefinition;
	}, [profilesMap]);

	const table = useMRTTable('default', {
		columns: isPending ? placeholderColumns : columns,
		data: rows,
		state: {
			isLoading: isPending,
			columnPinning: {
				left: ['permission'],
			},
		},
		enableRowSelection: false,
		enableSorting: false,
		enablePagination: false,
		enableBottomToolbar: false,
		enableColumnPinning: true,
		muiTableProps: {
			sx: {
				'& tr th:not(:first-of-type) .Mui-TableHeadCell-Content, & tr td:not(:first-of-type)':
					{
						justifyContent: 'center',
					},
				'& tr th:first-of-type .Mui-TableHeadCell-Content, & tr td:first-of-type':
					{
						justifyContent: 'flex-start !important',
					},
				'& th[data-pinned="true"]:before, & td[data-pinned="true"]:before': {
					boxShadow: 'unset',
					borderRight: `1px dashed ${theme.vars.palette.divider}`,
					backgroundColor: 'var(--permission-column-bg) !important',
				},
				'& th[data-pinned="true"], & td[data-pinned="true"]': {
					opacity: 1,
				},
			},
		},
	});

	const { mode } = useColorScheme();

	return (
		<Card
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			style={{
				['--permission-column-bg' as string]:
					mode === 'dark'
						? darken(theme.palette.grey[800], 0.05)
						: theme.vars.palette.grey[100],
			}}
		>
			<MaterialReactTable table={table} />
		</Card>
	);
};

export default TenantProfilesTable;

const ProfileHeader: MRT_ColumnDef<TenantProfileRowData, string>['Header'] = ({
	column,
}) => {
	const openDrawer = useBoolean();
	const confirmDialog = useBoolean();
	const { t } = useTranslate();

	const onConfirmDeleteRow = () => {
		// menuActions.onClose();
		confirmDialog.onFalse();
		toast.warning(`onDelete: ${column.columnDef.header}`);
	};

	const renderConfirmDialog = () => (
		<ConfirmDialog
			open={confirmDialog.value}
			onClose={confirmDialog.onFalse}
			title={_.capitalize(t('delete-item', { item: t('profile') }))}
			content={t('confirm-delete-dialog-text')}
			action={
				<Button variant="contained" color="error" onClick={onConfirmDeleteRow}>
					{t('delete')}
				</Button>
			}
		/>
	);

	const renderDrawer = () => {
		return (
			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => {
					return {
						zIndex: theme.zIndex.modal + 1,
					};
				}}
				slotProps={{
					paper: {
						sx: { width: 400 },
					},
				}}
			>
				<Typography variant="h6">{column.columnDef.header}</Typography>
			</Drawer>
		);
	};

	return (
		<>
			<Stack direction="row" alignItems="center" gap={1}>
				<Link
					onClick={openDrawer.onToggle}
					sx={{ cursor: 'pointer', color: 'inherit' }}
				>
					<Typography
						sx={{
							maxWidth: 105,
						}}
						noWrap
						variant="body2"
					>
						{column.columnDef.header}
					</Typography>
				</Link>
				<IconButton size="small" color="error" onClick={confirmDialog.onTrue}>
					<Iconify icon="solar:trash-bin-trash-bold" />
				</IconButton>
			</Stack>

			{renderDrawer()}
			{renderConfirmDialog()}
		</>
	);
};
