import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

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
			gridTemplateColumns: { xs: '1fr', md: '1fr auto' },
			gap: { xs: 1.5, md: 3 },
			alignItems: 'center',
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

const AccountNotificationsPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('account-settings')}
				title={t('notifications')}
			/>

			{/* Email Notifications */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 1 }}>
					{t('email-notifications')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
					{t('manage-your-email-notification-preferences')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow
						label={t('marketing-emails')}
						description="News, features, and product updates"
					>
						<Switch defaultChecked disabled />
					</FormRow>

					<FormRow
						label={t('product-updates')}
						description="Important updates about the platform"
					>
						<Switch defaultChecked disabled />
					</FormRow>

					<FormRow
						label={t('security-alerts')}
						description="Security and account activity alerts"
					>
						<Switch defaultChecked disabled />
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>

			{/* Push Notifications */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 1 }}>
					{t('push-notifications')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
					{t('manage-your-push-notification-preferences')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow
						label={t('new-messages')}
						description="Receive notifications for new messages"
					>
						<Switch defaultChecked disabled />
					</FormRow>

					<FormRow
						label={t('mentions')}
						description="Get notified when someone mentions you"
					>
						<Switch defaultChecked disabled />
					</FormRow>

					<FormRow
						label={t('comments')}
						description="Notifications for comments on your posts"
					>
						<Switch disabled />
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>

			{/* Activity Digest */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 1 }}>
					{t('activity-digest')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
					{t('manage-your-activity-digest-preferences')}
				</Typography>

				<Stack divider={<Divider />}>
					<FormRow
						label={t('weekly-digest')}
						description="Summary of your weekly activity"
					>
						<Switch defaultChecked disabled />
					</FormRow>

					<FormRow
						label={t('monthly-report')}
						description="Monthly performance and analytics report"
					>
						<Switch disabled />
					</FormRow>
				</Stack>

				<Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
					<Button variant="contained" disabled>
						{t('save-changes')}
					</Button>
				</Box>
			</Card>
		</Stack>
	);
};

export default AccountNotificationsPage;
