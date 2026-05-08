import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import map from 'lodash/map';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	type MRT_ColumnDef,
} from 'material-react-table';
import { useMemo } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { SettingsPageHeader } from '#app/components/settings/settings-page-header.tsx';
import { useMRTTable } from '#app/hooks/use-mrt-table.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

// Productization placeholder: this surface uses mock data until the tenant
// roles/permissions API lands. Issue #396. Loading/error states are intentionally
// not wired (static data) — the shared MRT shell still renders an empty fallback
// once the future API returns zero rows.
const MOCK_ROLES = [
	{
		id: '1',
		name: 'Owner',
		description: 'Full access to all organization settings and data',
		members: 1,
	},
	{
		id: '2',
		name: 'Admin',
		description: 'Can manage members, workspaces, and most settings',
		members: 2,
	},
	{
		id: '3',
		name: 'Editor',
		description: 'Can create and edit content across workspaces',
		members: 5,
	},
	{
		id: '4',
		name: 'Viewer',
		description: 'Can view content but cannot make changes',
		members: 8,
	},
];

type RoleRowData = {
	id: string;
	name: string;
	description: string;
	members: number;
};

const columnHelper = createMRTColumnHelper<RoleRowData>();

const SettingsRolesPage = () => {
	const { t } = useTranslate();

	const data = useMemo(() => {
		return map(MOCK_ROLES, mapRoleRowData);
	}, []);

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('name', {
				header: t('role'),
				Cell: RoleNameCell,
				enableSorting: false,
				size: 260,
			}),
			columnHelper.accessor('description', {
				header: t('description'),
				Cell: DescriptionCell,
				enableSorting: false,
				size: 360,
			}),
			columnHelper.accessor('members', {
				header: t('members'),
				Cell: MembersCell,
				enableSorting: false,
				size: 140,
			}),
			columnHelper.display({
				id: 'actions',
				header: t('actions'),
				Cell: RoleActionsCell,
				size: 100,
			}),
		];
	}, [t]);

	const searchDisabledReason = t('roles-search-disabled-reason', {
		defaultValue:
			'Search will be available once the tenant roles API is connected.',
	});
	const createDisabledReason = t('roles-create-disabled-reason', {
		defaultValue:
			'Creating roles will be available once the tenant roles API is connected.',
	});

	const table = useMRTTable<RoleRowData>('minimal', {
		columns,
		data,
		enableRowSelection: false,
		enableGlobalFilter: false,
		enableColumnFilters: false,
		enableHiding: false,
		enableDensityToggle: false,
		enableFullScreenToggle: false,
		state: {
			density: 'compact',
		},
		meta: {
			renderToolbarFilters: () => {
				return (
					<Tooltip title={searchDisabledReason} placement="top" arrow>
						<Box component="span" sx={{ display: 'inline-flex' }}>
							<TextField
								size="small"
								placeholder={t('search-roles', {
									defaultValue: 'Search roles',
								})}
								disabled
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<Iconify
													icon="eva:search-fill"
													width={20}
													sx={{ color: 'text.disabled' }}
												/>
											</InputAdornment>
										),
										'aria-label': t('search-roles', {
											defaultValue: 'Search roles',
										}),
									},
								}}
								sx={{ minWidth: 240 }}
							/>
						</Box>
					</Tooltip>
				);
			},
			renderToolbarActions: () => {
				return (
					<Tooltip title={createDisabledReason} placement="top" arrow>
						<Box component="span" sx={{ display: 'inline-flex' }}>
							<Button
								variant="contained"
								startIcon={<Iconify icon="mingcute:add-line" width={16} />}
								disabled
							>
								{t('create-role', { defaultValue: 'Create role' })}
							</Button>
						</Box>
					</Tooltip>
				);
			},
		},
		// The page wraps this table in a padded Card and stacks it next to other
		// content blocks, so we override the preset's full-page paper styling
		// (minHeight 640, height: '1px', flex-grow) to render at natural height.
		muiTablePaperProps: {
			sx: {
				minHeight: 'unset',
				flexGrow: 0,
				height: 'auto',
			},
		},
	});

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('roles-and-permissions')}
			/>

			{/* Roles Card */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('roles')}
				</Typography>

				<MaterialReactTable table={table} />
			</Card>

			{/* Permissions Overview */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 2 }}>
					{t('permissions')}
				</Typography>
				<Box
					sx={{
						py: 4,
						textAlign: 'center',
						bgcolor: 'background.neutral',
						borderRadius: 1,
					}}
				>
					<Iconify
						icon="solar:shield-keyhole-bold-duotone"
						width={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					/>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						Permission matrix editor coming soon
					</Typography>
				</Box>
			</Card>
		</Stack>
	);
};

export default SettingsRolesPage;

const mapRoleRowData = (role: (typeof MOCK_ROLES)[number]): RoleRowData => {
	return {
		id: role.id,
		name: role.name,
		description: role.description,
		members: role.members,
	};
};

const RoleNameCell: MRT_ColumnDef<RoleRowData, string>['Cell'] = (props) => {
	const name = props.cell.getValue();

	return (
		<Stack direction="row" alignItems="center" spacing={2}>
			<Avatar
				sx={{
					width: 36,
					height: 36,
					bgcolor: 'background.neutral',
					color: 'text.disabled',
				}}
			>
				<Iconify icon="solar:shield-check-bold" width={20} />
			</Avatar>
			<Typography variant="subtitle2">{name}</Typography>
		</Stack>
	);
};

const DescriptionCell: MRT_ColumnDef<RoleRowData, string>['Cell'] = (props) => {
	const description = props.cell.getValue();

	return (
		<Typography variant="body2" sx={{ color: 'text.secondary' }}>
			{description}
		</Typography>
	);
};

const MembersCell: MRT_ColumnDef<RoleRowData, number>['Cell'] = (props) => {
	const { t } = useTranslate();
	const members = props.cell.getValue();
	const label =
		members === 1
			? t('members-count-one', { count: members, defaultValue: '1 member' })
			: t('members-count-other', {
					count: members,
					defaultValue: '{{count}} members',
				});

	return <Chip label={label} size="small" variant="soft" />;
};

const RoleActionsCell: MRT_ColumnDef<RoleRowData>['Cell'] = () => {
	const { t } = useTranslate();
	const editLabel = t('edit');
	const deleteLabel = t('delete');
	const editDisabledReason = t('roles-edit-disabled-reason', {
		defaultValue:
			'Editing roles will be available once the tenant roles API is connected.',
	});
	const deleteDisabledReason = t('roles-delete-disabled-reason', {
		defaultValue:
			'Deleting roles will be available once the tenant roles API is connected.',
	});

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			<Tooltip title={editDisabledReason} placement="top" arrow>
				<Box component="span" sx={{ display: 'inline-flex' }}>
					<IconButton size="small" disabled aria-label={editLabel}>
						<Iconify icon="solar:pen-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>
			<Tooltip title={deleteDisabledReason} placement="top" arrow>
				<Box component="span" sx={{ display: 'inline-flex' }}>
					<IconButton size="small" disabled aria-label={deleteLabel}>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>
		</Box>
	);
};
