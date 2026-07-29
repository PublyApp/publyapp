import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
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

const AccountProfilePage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('account-settings')}
				title={t('profile')}
			/>

			{/* Profile Card */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('personal-information')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow label="Avatar" description="150x150px JPEG, PNG image">
						<Stack direction="row" alignItems="center" spacing={2}>
							<Avatar
								sx={{
									width: 64,
									height: 64,
									bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
								}}
							>
								<Iconify
									icon="solar:user-circle-bold-duotone"
									width={32}
									sx={{ color: 'primary.main' }}
								/>
							</Avatar>
							<Button variant="outlined" size="small" disabled>
								Change
							</Button>
						</Stack>
					</FormRow>

					<FormRow label={t('firstname')}>
						<TextField
							fullWidth
							size="small"
							defaultValue="Jason"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label={t('lastname')}>
						<TextField
							fullWidth
							size="small"
							defaultValue="Tatum"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label={t('email')} description="Your login email address">
						<TextField
							fullWidth
							size="small"
							defaultValue="jason@studio.io"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label="Bio" description="Brief description for your profile">
						<TextField
							fullWidth
							size="small"
							multiline
							rows={3}
							defaultValue="Product designer and creative director."
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>

			{/* Preferences */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('preferences')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow
						label="Language"
						description="Choose your preferred language"
					>
						<TextField
							select
							size="small"
							defaultValue="en"
							disabled
							sx={{ minWidth: 200 }}
							slotProps={{
								select: {
									native: true,
								},
							}}
						>
							<option value="en">English</option>
							<option value="fr">Français</option>
						</TextField>
					</FormRow>

					<FormRow label="Timezone" description="Used for scheduling posts">
						<TextField
							select
							size="small"
							defaultValue="utc"
							disabled
							sx={{ minWidth: 200 }}
							slotProps={{
								select: {
									native: true,
								},
							}}
						>
							<option value="utc">UTC (GMT+0)</option>
							<option value="est">Eastern Time (GMT-5)</option>
							<option value="pst">Pacific Time (GMT-8)</option>
							<option value="cet">Central European Time (GMT+1)</option>
						</TextField>
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>

			{/* Danger Zone */}
			<Card
				sx={{
					p: 3,
					border: '1px solid',
					borderColor: 'error.main',
					bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
				}}
			>
				<Typography variant="h4" sx={{ color: 'error.main', mb: 1 }}>
					{t('danger-zone')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
					Once you delete your account, there is no going back. Please be
					certain.
				</Typography>

				<Button variant="outlined" color="error" disabled>
					Delete account
				</Button>
			</Card>
		</Stack>
	);
};

export default AccountProfilePage;
