import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { FormRow } from '#app/components/settings/form-row.tsx';
import { SettingsPageHeader } from '#app/components/settings/settings-page-header.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

const SettingsSecurityPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('security')}
			/>

			{/* Authentication Settings */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('authentication')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow
						label={t('two-factor-authentication')}
						description="Require 2FA for all organization members"
					>
						<Stack direction="row" alignItems="center" spacing={2}>
							<Switch disabled />
							<Typography variant="body2" sx={{ color: 'text.secondary' }}>
								Off
							</Typography>
						</Stack>
					</FormRow>

					<FormRow
						label="Single Sign-On (SSO)"
						description="Allow members to sign in with your identity provider"
					>
						<Stack spacing={2}>
							<Stack direction="row" alignItems="center" spacing={1}>
								<Chip label="Enterprise" size="small" variant="soft" />
								<Typography variant="body2" sx={{ color: 'text.secondary' }}>
									Upgrade to enable SSO
								</Typography>
							</Stack>
							<Button
								variant="outlined"
								size="small"
								disabled
								sx={{ alignSelf: 'flex-start' }}
							>
								Configure SSO
							</Button>
						</Stack>
					</FormRow>

					<FormRow
						label="Password requirements"
						description="Set minimum password strength for members"
					>
						<TextField
							select
							size="small"
							defaultValue="medium"
							disabled
							sx={{ minWidth: 200 }}
							slotProps={{
								select: {
									native: true,
								},
							}}
						>
							<option value="low">Low - 8+ characters</option>
							<option value="medium">Medium - 12+ characters, 1 special</option>
							<option value="high">
								High - 16+ characters, mixed case, special
							</option>
						</TextField>
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>

			{/* Session Settings */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('session-settings')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow
						label={t('session-timeout')}
						description="Automatically log out inactive users"
					>
						<TextField
							select
							size="small"
							defaultValue="24h"
							disabled
							sx={{ minWidth: 200 }}
							slotProps={{
								select: {
									native: true,
								},
							}}
						>
							<option value="1h">1 hour</option>
							<option value="8h">8 hours</option>
							<option value="24h">24 hours</option>
							<option value="7d">7 days</option>
							<option value="30d">30 days</option>
						</TextField>
					</FormRow>

					<FormRow
						label="Concurrent sessions"
						description="Allow users to be logged in from multiple devices"
					>
						<Stack direction="row" alignItems="center" spacing={2}>
							<Switch defaultChecked disabled />
							<Typography variant="body2" sx={{ color: 'text.secondary' }}>
								Allowed
							</Typography>
						</Stack>
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>

			{/* IP Restrictions */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 2 }}>
					{t('ip-restrictions')}
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
						icon="solar:shield-check-bold"
						width={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					/>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						IP allowlist and restrictions coming soon
					</Typography>
				</Box>
			</Card>

			{/* Audit Log */}
			<Card sx={{ p: 3 }}>
				<Stack
					direction="row"
					alignItems="center"
					justifyContent="space-between"
					sx={{ mb: 2 }}
				>
					<Typography variant="h4">{t('audit-logs')}</Typography>
					<Button variant="outlined" size="small" disabled>
						{t('view-all')}
					</Button>
				</Stack>
				<Box
					sx={{
						py: 4,
						textAlign: 'center',
						bgcolor: 'background.neutral',
						borderRadius: 1,
					}}
				>
					<Iconify
						icon="solar:document-text-bold-duotone"
						width={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					/>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						{t('no-audit-logs-yet')}
					</Typography>
				</Box>
			</Card>
		</Stack>
	);
};

export default SettingsSecurityPage;
