import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Iconify } from '@/front/components/iconify/iconify';
import { FormRow } from '@/front/components/settings/form-row';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

const SettingsGeneralPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('general')}
			/>

			{/* Organization Details Card */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('organization-details')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow label="Logo" description="150x150px JPEG, PNG image">
						<Stack direction="row" alignItems="center" spacing={2}>
							<Avatar
								sx={{
									width: 64,
									height: 64,
									bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
								}}
							>
								<Iconify
									icon="solar:buildings-bold-duotone"
									width={32}
									sx={{ color: 'primary.main' }}
								/>
							</Avatar>
							<Button variant="outlined" size="small" disabled>
								Change
							</Button>
						</Stack>
					</FormRow>

					<FormRow label={t('name')}>
						<TextField
							fullWidth
							size="small"
							defaultValue="Acme Inc."
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow
						label="Subdomain"
						description="Your organization's unique URL"
					>
						<TextField
							fullWidth
							size="small"
							defaultValue="acme"
							disabled
							sx={{ maxWidth: 400 }}
							slotProps={{
								input: {
									endAdornment: (
										<Typography
											variant="body2"
											sx={{ color: 'text.secondary' }}
										>
											.publyapp.com
										</Typography>
									),
								},
							}}
						/>
					</FormRow>

					<FormRow label={t('description')}>
						<TextField
							fullWidth
							size="small"
							multiline
							rows={3}
							defaultValue="A leading social media management platform for growing businesses."
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label="Industry">
						<TextField
							fullWidth
							size="small"
							defaultValue="Technology"
							disabled
							sx={{ maxWidth: 400 }}
						/>
					</FormRow>

					<FormRow label="Website">
						<TextField
							fullWidth
							size="small"
							defaultValue="https://acme.com"
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

			{/* Danger Zone */}
			<Card
				sx={{
					p: 3,
					border: '1px solid',
					borderColor: 'error.main',
					bgcolor: (theme) => alpha(theme.palette.error.main, 0.02),
				}}
			>
				<Typography variant="h5" sx={{ color: 'error.main', mb: 1 }}>
					Danger zone
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
					Once you delete your organization, there is no going back. Please be
					certain.
				</Typography>

				<Button variant="outlined" color="error" disabled>
					Delete organization
				</Button>
			</Card>
		</Stack>
	);
};

export default SettingsGeneralPage;
