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

type MemberRowData = {
	id: string;
	name: string;
	email: string;
	role: string;
	status: 'Active' | 'Pending';
	lastActive: string;
};

// Productization placeholder: this surface uses mock data until the tenant
// members API lands. Issue #395. Loading/error states are intentionally not
// modelled — the data is static, so only the empty-state pathway from the
// shared MRT preset is relevant for future parity.
const MOCK_MEMBERS: MemberRowData[] = [
	{
		id: '1',
		name: 'Jason Tatum',
		email: 'jason@studio.io',
		role: 'Owner',
		status: 'Active',
		lastActive: '2 min ago',
	},
	{
		id: '2',
		name: 'Sarah Connor',
		email: 'sarah@studio.io',
		role: 'Admin',
		status: 'Active',
		lastActive: '1 hour ago',
	},
	{
		id: '3',
		name: 'Mike Johnson',
		email: 'mike@studio.io',
		role: 'Editor',
		status: 'Active',
		lastActive: '3 hours ago',
	},
	{
		id: '4',
		name: 'Emily Davis',
		email: 'emily@studio.io',
		role: 'Viewer',
		status: 'Pending',
		lastActive: 'Never',
	},
];

const columnHelper = createMRTColumnHelper<MemberRowData>();

const SettingsMembersPage = () => {
	const { t } = useTranslate();

	const searchDisabledReason = t('members-search-disabled-reason', {
		defaultValue:
			'Search will be available once the tenant members API is connected.',
	});
	const inviteDisabledReason = t('members-invite-disabled-reason', {
		defaultValue:
			'Inviting members will be available once the tenant members API is connected.',
	});

	const columns = useMemo(() => {
		return [
			columnHelper.accessor('name', {
				header: t('member', { defaultValue: 'Member' }),
				Cell: MemberCell,
				enableSorting: false,
				size: 320,
			}),
			columnHelper.accessor('role', {
				header: t('role'),
				Cell: RoleCell,
				enableSorting: false,
				size: 140,
			}),
			columnHelper.accessor('status', {
				header: t('status'),
				Cell: StatusCell,
				enableSorting: false,
				size: 120,
			}),
			columnHelper.accessor('lastActive', {
				header: t('last-active'),
				Cell: LastActiveCell,
				enableSorting: false,
				size: 160,
			}),
			columnHelper.display({
				id: 'actions',
				header: t('actions'),
				Cell: MemberActionsCell,
				size: 100,
			}),
		];
	}, [t]);

	const table = useMRTTable<MemberRowData>('minimal', {
		columns,
		data: MOCK_MEMBERS,
		enableRowSelection: false,
		enableGlobalFilter: false,
		enableColumnFilters: false,
		enableHiding: false,
		enableDensityToggle: false,
		enableFullScreenToggle: false,
		getRowId: (row) => row.id,
		state: {
			density: 'compact',
		},
		muiTablePaperProps: {
			// Preset defaults (minHeight: 640, height: '1px', flexGrow: 1) target
			// full-page tables; this surface lives inside a settings Card.
			sx: {
				minHeight: 'unset',
				flexGrow: 0,
				height: 'auto',
			},
		},
		meta: {
			renderToolbarFilters: () => {
				return (
					<Tooltip title={searchDisabledReason} placement="top" arrow>
						<Box component="span">
							<TextField
								size="small"
								placeholder={t('search-members', {
									defaultValue: 'Search members...',
								})}
								disabled
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<Iconify icon="eva:search-fill" />
											</InputAdornment>
										),
										'aria-label': t('search'),
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
					<Tooltip title={inviteDisabledReason} placement="top" arrow>
						<Box component="span">
							<Button
								variant="contained"
								startIcon={<Iconify icon="mingcute:add-line" width={16} />}
								disabled
							>
								{t('invite-member')}
							</Button>
						</Box>
					</Tooltip>
				);
			},
		},
	});

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('members')}
			/>

			{/* Team Members Card */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('team-members')}
				</Typography>

				<MaterialReactTable table={table} />
			</Card>

			{/* Pending Invitations */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 2 }}>
					{t('pending-invitations')}
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
						icon="solar:letter-bold"
						width={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					/>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						No pending invitations
					</Typography>
				</Box>
			</Card>
		</Stack>
	);
};

export default SettingsMembersPage;

// ----------------------------------------------------------------------

const MemberCell: MRT_ColumnDef<MemberRowData, string>['Cell'] = (props) => {
	const member = props.row.original;

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
				<Iconify icon="solar:user-rounded-bold" width={20} />
			</Avatar>
			<Box sx={{ minWidth: 0 }}>
				<Typography variant="subtitle2" noWrap>
					{member.name}
				</Typography>
				<Typography
					variant="caption"
					noWrap
					sx={{ color: 'text.secondary', display: 'block' }}
				>
					{member.email}
				</Typography>
			</Box>
		</Stack>
	);
};

const RoleCell: MRT_ColumnDef<MemberRowData, string>['Cell'] = (props) => {
	return <Typography variant="body2">{props.cell.getValue()}</Typography>;
};

const StatusCell: MRT_ColumnDef<
	MemberRowData,
	MemberRowData['status']
>['Cell'] = (props) => {
	const { t } = useTranslate();
	const status = props.cell.getValue();
	const statusLabel = status === 'Active' ? t('active') : t('pending');

	return (
		<Chip
			label={statusLabel}
			size="small"
			color={status === 'Active' ? 'success' : 'warning'}
			variant="soft"
		/>
	);
};

const LastActiveCell: MRT_ColumnDef<MemberRowData, string>['Cell'] = (
	props,
) => {
	return (
		<Typography variant="body2" sx={{ color: 'text.secondary' }}>
			{props.cell.getValue()}
		</Typography>
	);
};

const MemberActionsCell: MRT_ColumnDef<MemberRowData>['Cell'] = () => {
	const { t } = useTranslate();

	const editDisabledReason = t('members-edit-disabled-reason', {
		defaultValue:
			'Editing members will be available once the tenant members API is connected.',
	});
	const removeDisabledReason = t('members-remove-disabled-reason', {
		defaultValue:
			'Removing members will be available once the tenant members API is connected.',
	});

	return (
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
			<Tooltip title={editDisabledReason} placement="top" arrow>
				<Box component="span">
					<IconButton size="small" disabled aria-label={t('edit')}>
						<Iconify icon="solar:pen-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>
			<Tooltip title={removeDisabledReason} placement="top" arrow>
				<Box component="span">
					<IconButton size="small" disabled aria-label={t('delete')}>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Box>
			</Tooltip>
		</Box>
	);
};
