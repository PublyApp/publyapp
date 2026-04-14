import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { SettingsPageHeader } from '#app/components/settings/settings-page-header.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

const MOCK_WORKSPACES = [
	{
		id: '1',
		name: 'Marketing',
		description: 'Marketing team workspace',
		members: 5,
		socialAccounts: 3,
	},
	{
		id: '2',
		name: 'Product',
		description: 'Product announcements and updates',
		members: 3,
		socialAccounts: 2,
	},
	{
		id: '3',
		name: 'Support',
		description: 'Customer support communications',
		members: 4,
		socialAccounts: 2,
	},
];

const SettingsWorkspacesPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('workspaces')}
			/>

			{/* All Workspaces Card */}
			<Card sx={{ p: 3 }}>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					alignItems={{ xs: 'stretch', sm: 'center' }}
					justifyContent="space-between"
					spacing={2}
					sx={{ mb: 3 }}
				>
					<Typography variant="h4">{t('all-workspaces')}</Typography>
					<Stack direction="row" spacing={2}>
						<TextField
							size="small"
							placeholder="Search workspaces..."
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
							Create workspace
						</Button>
					</Stack>
				</Stack>

				{/* Workspace Grid */}
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							lg: 'repeat(3, 1fr)',
						},
						gap: 3,
					}}
				>
					{MOCK_WORKSPACES.map((workspace) => (
						<Card
							key={workspace.id}
							sx={{
								p: 3,
								border: '1px solid',
								borderColor: 'divider',
								boxShadow: 'none',
							}}
						>
							<Stack spacing={2}>
								<Stack
									direction="row"
									alignItems="center"
									justifyContent="space-between"
								>
									<Stack direction="row" alignItems="center" spacing={2}>
										<Avatar
											sx={{
												width: 48,
												height: 48,
												bgcolor: 'background.neutral',
												color: 'text.disabled',
											}}
										>
											<Iconify icon="solar:buildings-bold" width={24} />
										</Avatar>
										<Box>
											<Typography variant="subtitle1">
												{workspace.name}
											</Typography>
											<Typography
												variant="caption"
												sx={{ color: 'text.secondary' }}
											>
												{workspace.description}
											</Typography>
										</Box>
									</Stack>
									<IconButton size="small" disabled>
										<Iconify icon="eva:more-vertical-fill" width={20} />
									</IconButton>
								</Stack>

								<Stack direction="row" spacing={1}>
									<Chip
										icon={
											<Iconify
												icon="solar:users-group-rounded-bold"
												width={16}
											/>
										}
										label={`${workspace.members} members`}
										size="small"
										variant="soft"
									/>
									<Chip
										icon={<Iconify icon="solar:share-bold" width={16} />}
										label={`${workspace.socialAccounts} accounts`}
										size="small"
										variant="soft"
									/>
								</Stack>
							</Stack>
						</Card>
					))}
				</Box>
			</Card>

			{/* Default Workspace */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 2 }}>
					{t('default-workspace')}
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
						icon="solar:add-folder-bold"
						width={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					/>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						Default workspace configuration coming soon
					</Typography>
				</Box>
			</Card>
		</Stack>
	);
};

export default SettingsWorkspacesPage;
