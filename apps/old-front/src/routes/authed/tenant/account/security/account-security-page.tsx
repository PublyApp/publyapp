import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { SettingsPageHeader } from '#app/components/settings/settings-page-header.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

// Horizontal form row component for consistent layout
const FormRow = ({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: React.ReactNode;
}) => (
	<Box
		sx={{
			display: 'grid',
			gridTemplateColumns: { xs: '1fr', md: '240px 1fr' },
			gap: { xs: 1.5, md: 3 },
			alignItems: 'flex-start',
			py: 2,
		}}
	>
		<Box>
			<Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
				{label}
			</Typography>
			{description && (
				<Typography variant="caption" sx={{ color: 'text.secondary' }}>
					{description}
				</Typography>
			)}
		</Box>
		<Box>{children}</Box>
	</Box>
);

const MOCK_SESSIONS = [
	{
		id: '1',
		device: 'Chrome on MacBook Pro',
		location: 'Paris, France',
		lastActive: 'Now',
		current: true,
	},
	{
		id: '2',
		device: 'Safari on iPhone 15',
		location: 'Paris, France',
		lastActive: '2 hours ago',
		current: false,
	},
	{
		id: '3',
		device: 'Firefox on Windows',
		location: 'London, UK',
		lastActive: '3 days ago',
		current: false,
	},
];

const AccountSecurityPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('account-settings')}
				title={t('security')}
			/>

			{/* Change Password */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('change-password')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow label={t('current-password')}>
						<TextField
							fullWidth
							size="small"
							type="password"
							placeholder="Enter current password"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label={t('new-password')}>
						<TextField
							fullWidth
							size="small"
							type="password"
							placeholder="Enter new password"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label={t('confirm-new-password')}>
						<TextField
							fullWidth
							size="small"
							type="password"
							placeholder="Confirm new password"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						Update password
					</Button>
				</Box>
			</Card>

			{/* Two-Factor Authentication */}
			<Card sx={{ p: 3 }}>
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					alignItems={{ xs: 'stretch', sm: 'center' }}
					justifyContent="space-between"
					spacing={2}
					sx={{ mb: 3 }}
				>
					<Box>
						<Stack
							direction="row"
							alignItems="center"
							spacing={1}
							sx={{ mb: 0.5 }}
						>
							<Typography variant="h4">
								{t('two-factor-authentication')}
							</Typography>
							<Chip
								label="Disabled"
								size="small"
								color="warning"
								variant="soft"
							/>
						</Stack>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							{t('two-factor-authentication-description')}
						</Typography>
					</Box>
					<Button variant="outlined" disabled>
						Enable 2FA
					</Button>
				</Stack>

				<Box
					sx={{
						p: 2,
						bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08),
						borderRadius: 1,
						display: 'flex',
						alignItems: 'center',
						gap: 2,
					}}
				>
					<Iconify
						icon="solar:shield-check-bold"
						width={24}
						sx={{ color: 'warning.main' }}
					/>
					<Typography variant="body2">
						Two-factor authentication adds an extra layer of security to your
						account.
					</Typography>
				</Box>
			</Card>

			{/* Active Sessions */}
			<Card sx={{ p: 3 }}>
				<Stack
					direction="row"
					alignItems="center"
					justifyContent="space-between"
					sx={{ mb: 3 }}
				>
					<Typography variant="h4">{t('active-sessions')}</Typography>
					<Button variant="outlined" color="error" size="small" disabled>
						Sign out all devices
					</Button>
				</Stack>

				<Stack spacing={2}>
					{MOCK_SESSIONS.map((session) => (
						<Box
							key={session.id}
							sx={{
								p: 2,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								border: '1px solid',
								borderColor: session.current ? 'primary.main' : 'divider',
								borderRadius: 1,
								bgcolor: session.current
									? (theme) => alpha(theme.palette.primary.main, 0.04)
									: 'transparent',
							}}
						>
							<Stack direction="row" alignItems="center" spacing={2}>
								<Box
									sx={{
										width: 40,
										height: 40,
										borderRadius: 1,
										bgcolor: 'background.neutral',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
									}}
								>
									<Iconify
										icon={
											session.device.includes('iPhone')
												? 'solar:smartphone-2-bold'
												: 'solar:monitor-bold'
										}
										width={24}
										sx={{ color: 'text.secondary' }}
									/>
								</Box>
								<Box>
									<Stack direction="row" alignItems="center" spacing={1}>
										<Typography variant="subtitle2">
											{session.device}
										</Typography>
										{session.current && (
											<Chip
												label="Current"
												size="small"
												color="primary"
												variant="soft"
											/>
										)}
									</Stack>
									<Typography
										variant="caption"
										sx={{ color: 'text.secondary' }}
									>
										{session.location} • {session.lastActive}
									</Typography>
								</Box>
							</Stack>
							{!session.current && (
								<IconButton size="small" disabled>
									<Iconify icon="solar:export-bold" width={20} />
								</IconButton>
							)}
						</Box>
					))}
				</Stack>
			</Card>

			{/* Login History */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 2 }}>
					{t('login-history')}
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
						icon="solar:clock-circle-bold"
						width={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					/>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						Login history coming soon
					</Typography>
				</Box>
			</Card>
		</Stack>
	);
};

export default AccountSecurityPage;
