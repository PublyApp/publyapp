import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { SettingsPageHeader } from '#app/components/settings/settings-page-header.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

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

const SettingsRolesPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('roles-and-permissions')}
			/>

			{/* Roles Card */}
			<Card sx={{ p: 3 }}>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					alignItems={{ xs: 'stretch', sm: 'center' }}
					justifyContent="space-between"
					spacing={2}
					sx={{ mb: 3 }}
				>
					<Typography variant="h4">{t('roles')}</Typography>
					<Stack direction="row" spacing={2}>
						<TextField
							size="small"
							placeholder="Search roles..."
							disabled
							slotProps={{
								input: {
									startAdornment: (
										<Iconify
											icon="eva:search-fill"
											width={20}
											sx={{ color: 'text.disabled', mr: 1 }}
										/>
									),
								},
							}}
							sx={{ width: 200 }}
						/>
						<Button
							variant="contained"
							startIcon={<Iconify icon="mingcute:add-line" width={16} />}
							disabled
						>
							Create role
						</Button>
					</Stack>
				</Stack>

				<TableContainer>
					<Table>
						<TableHead>
							<TableRow>
								<TableCell>Role</TableCell>
								<TableCell>{t('description')}</TableCell>
								<TableCell>{t('members')}</TableCell>
								<TableCell align="right">{t('actions')}</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{MOCK_ROLES.map((role) => (
								<TableRow key={role.id}>
									<TableCell>
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
											<Typography variant="subtitle2">{role.name}</Typography>
										</Stack>
									</TableCell>
									<TableCell>
										<Typography
											variant="body2"
											sx={{ color: 'text.secondary' }}
										>
											{role.description}
										</Typography>
									</TableCell>
									<TableCell>
										<Chip
											label={`${role.members} ${role.members === 1 ? 'member' : 'members'}`}
											size="small"
											variant="soft"
										/>
									</TableCell>
									<TableCell align="right">
										<IconButton size="small" disabled>
											<Iconify icon="solar:pen-bold" width={18} />
										</IconButton>
										<IconButton size="small" disabled>
											<Iconify icon="solar:trash-bin-trash-bold" width={18} />
										</IconButton>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
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
