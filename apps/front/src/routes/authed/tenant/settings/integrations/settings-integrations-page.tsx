import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { Iconify } from '@/front/components/iconify/iconify';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

const INTEGRATIONS = [
	{
		id: '1',
		name: 'Slack',
		description: 'Get notifications and updates in Slack',
		icon: 'logos:slack-icon',
		connected: true,
		category: 'communication',
	},
	{
		id: '2',
		name: 'Google Analytics',
		description: 'Track your social media performance',
		icon: 'logos:google-analytics',
		connected: false,
		category: 'analytics',
	},
	{
		id: '3',
		name: 'Zapier',
		description: 'Automate workflows with 5000+ apps',
		icon: 'logos:zapier-icon',
		connected: false,
		category: 'automation',
	},
	{
		id: '4',
		name: 'HubSpot',
		description: 'Sync contacts and track engagement',
		icon: 'logos:hubspot',
		connected: true,
		category: 'crm',
	},
	{
		id: '5',
		name: 'Notion',
		description: 'Plan and organize content in Notion',
		icon: 'logos:notion-icon',
		connected: false,
		category: 'productivity',
	},
	{
		id: '6',
		name: 'Canva',
		description: 'Design images directly from the app',
		icon: 'logos:canva-icon',
		connected: false,
		category: 'design',
	},
];

const SettingsIntegrationsPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('integrations')}
			/>

			{/* Connected Integrations */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('connected')}
				</Typography>

				<Stack spacing={2}>
					{INTEGRATIONS.filter((i) => i.connected).map((integration) => (
						<Box
							key={integration.id}
							sx={{
								p: 2,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								border: '1px solid',
								borderColor: 'divider',
								borderRadius: 1,
							}}
						>
							<Stack direction="row" alignItems="center" spacing={2}>
								<Avatar
									sx={{
										width: 48,
										height: 48,
										bgcolor: (theme) => alpha(theme.palette.grey[500], 0.08),
									}}
								>
									<Iconify icon="solar:settings-bold" width={28} />
								</Avatar>
								<Box>
									<Stack direction="row" alignItems="center" spacing={1}>
										<Typography variant="subtitle2">
											{integration.name}
										</Typography>
										<Chip
											label={t('connected')}
											size="small"
											color="success"
											variant="soft"
										/>
									</Stack>
									<Typography
										variant="caption"
										sx={{ color: 'text.secondary' }}
									>
										{integration.description}
									</Typography>
								</Box>
							</Stack>
							<Stack direction="row" alignItems="center" spacing={2}>
								<Switch checked disabled />
								<Button size="small" color="error" disabled>
									{t('disconnect')}
								</Button>
							</Stack>
						</Box>
					))}
				</Stack>
			</Card>

			{/* Available Integrations */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('available-integrations')}
				</Typography>

				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							lg: 'repeat(3, 1fr)',
						},
						gap: 2,
					}}
				>
					{INTEGRATIONS.filter((i) => !i.connected).map((integration) => (
						<Box
							key={integration.id}
							sx={{
								p: 2,
								border: '1px solid',
								borderColor: 'divider',
								borderRadius: 1,
							}}
						>
							<Stack direction="row" alignItems="flex-start" spacing={2}>
								<Avatar
									sx={{
										width: 40,
										height: 40,
										bgcolor: (theme) => alpha(theme.palette.grey[500], 0.08),
									}}
								>
									<Iconify icon="solar:settings-bold" width={24} />
								</Avatar>
								<Box sx={{ flex: 1 }}>
									<Typography variant="subtitle2">
										{integration.name}
									</Typography>
									<Typography
										variant="caption"
										sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
									>
										{integration.description}
									</Typography>
									<Button size="small" variant="outlined" disabled>
										{t('connect')}
									</Button>
								</Box>
							</Stack>
						</Box>
					))}
				</Box>
			</Card>

			{/* API Access */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 2 }}>
					{t('api-access')}
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
						icon="solar:file-text-bold"
						width={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					/>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						API keys and webhook configuration coming soon
					</Typography>
				</Box>
			</Card>
		</Stack>
	);
};

export default SettingsIntegrationsPage;
