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

import { Iconify } from '@/front/components/iconify/iconify';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

const MOCK_MEMBERS = [
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

const SettingsMembersPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('members')}
			/>

			{/* Team Members Card */}
			<Card sx={{ p: 3 }}>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					alignItems={{ xs: 'stretch', sm: 'center' }}
					justifyContent="space-between"
					spacing={2}
					sx={{ mb: 3 }}
				>
					<Typography variant="h4">{t('team-members')}</Typography>
					<Stack direction="row" spacing={2}>
						<TextField
							size="small"
							placeholder="Search members..."
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
							{t('invite-member')}
						</Button>
					</Stack>
				</Stack>

				<TableContainer>
					<Table>
						<TableHead>
							<TableRow>
								<TableCell>Member</TableCell>
								<TableCell>{t('role')}</TableCell>
								<TableCell>{t('status')}</TableCell>
								<TableCell>{t('last-active')}</TableCell>
								<TableCell align="right">{t('actions')}</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{MOCK_MEMBERS.map((member) => (
								<TableRow key={member.id}>
									<TableCell>
										<Stack direction="row" alignItems="center" spacing={2}>
											<Avatar sx={{ width: 36, height: 36 }}>
												{member.name.charAt(0)}
											</Avatar>
											<Box>
												<Typography variant="subtitle2">
													{member.name}
												</Typography>
												<Typography
													variant="caption"
													sx={{ color: 'text.secondary' }}
												>
													{member.email}
												</Typography>
											</Box>
										</Stack>
									</TableCell>
									<TableCell>
										<Typography variant="body2">{member.role}</Typography>
									</TableCell>
									<TableCell>
										<Chip
											label={member.status}
											size="small"
											color={member.status === 'Active' ? 'success' : 'warning'}
											variant="soft"
										/>
									</TableCell>
									<TableCell>
										<Typography
											variant="body2"
											sx={{ color: 'text.secondary' }}
										>
											{member.lastActive}
										</Typography>
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
