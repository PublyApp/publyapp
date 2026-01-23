import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { Iconify } from '@/front/components/iconify/iconify';
import { SettingsPageHeader } from '@/front/components/settings/settings-page-header';
import { useTranslate } from '@/front/hooks/use-translate';

const SettingsBillingPage = () => {
	const { t } = useTranslate();

	return (
		<Stack spacing={3}>
			<SettingsPageHeader
				subtitle={t('organization-settings')}
				title={t('billing')}
			/>

			{/* Current Plan */}
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
							<Typography variant="h4">{t('current-plan')}</Typography>
							<Chip label="Pro" size="small" color="primary" variant="soft" />
						</Stack>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							Your plan renews on January 1, 2027
						</Typography>
					</Box>
					<Stack direction="row" spacing={1}>
						<Button variant="outlined" disabled>
							Change plan
						</Button>
						<Button variant="outlined" color="error" disabled>
							Cancel subscription
						</Button>
					</Stack>
				</Stack>

				<Box
					sx={{
						p: 3,
						bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
						borderRadius: 1,
						border: '1px solid',
						borderColor: (theme) => alpha(theme.palette.primary.main, 0.16),
					}}
				>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						justifyContent="space-between"
						spacing={3}
					>
						<Box>
							<Typography variant="h4" sx={{ mb: 0.5 }}>
								$49
								<Typography
									component="span"
									variant="body2"
									sx={{ color: 'text.secondary' }}
								>
									/month
								</Typography>
							</Typography>
							<Typography variant="body2" sx={{ color: 'text.secondary' }}>
								Billed annually ($588/year)
							</Typography>
						</Box>
						<Stack spacing={1} sx={{ minWidth: 200 }}>
							<Typography variant="caption" sx={{ color: 'text.secondary' }}>
								10 of 25 team members
							</Typography>
							<LinearProgress
								variant="determinate"
								value={40}
								sx={{ height: 6, borderRadius: 3 }}
							/>
						</Stack>
					</Stack>
				</Box>
			</Card>

			{/* Payment Method */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('payment-method')}
				</Typography>

				<Box
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
						<Box
							sx={{
								width: 48,
								height: 32,
								bgcolor: 'background.neutral',
								borderRadius: 0.5,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Iconify icon="solar:wad-of-money-bold" width={32} />
						</Box>
						<Box>
							<Typography variant="subtitle2">Visa ending in 4242</Typography>
							<Typography variant="caption" sx={{ color: 'text.secondary' }}>
								Expires 12/2028
							</Typography>
						</Box>
					</Stack>
					<Button size="small" disabled>
						Update
					</Button>
				</Box>

				<Button
					startIcon={<Iconify icon="mingcute:add-line" width={20} />}
					sx={{ mt: 2 }}
					disabled
				>
					Add payment method
				</Button>
			</Card>

			{/* Billing History */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('billing-history')}
				</Typography>

				<Stack divider={<Divider />}>
					{[
						{ date: 'Dec 1, 2026', amount: '$49.00', status: 'Paid' },
						{ date: 'Nov 1, 2026', amount: '$49.00', status: 'Paid' },
						{ date: 'Oct 1, 2026', amount: '$49.00', status: 'Paid' },
					].map((invoice, index) => (
						<Stack
							key={index}
							direction="row"
							alignItems="center"
							justifyContent="space-between"
							sx={{ py: 2 }}
						>
							<Box>
								<Typography variant="body2">{invoice.date}</Typography>
								<Typography variant="caption" sx={{ color: 'text.secondary' }}>
									Pro plan - Monthly
								</Typography>
							</Box>
							<Stack direction="row" alignItems="center" spacing={2}>
								<Typography variant="subtitle2">{invoice.amount}</Typography>
								<Chip
									label={invoice.status}
									size="small"
									color="success"
									variant="soft"
								/>
								<Button size="small" disabled>
									Download
								</Button>
							</Stack>
						</Stack>
					))}
				</Stack>

				<Button sx={{ mt: 2 }} disabled>
					View all invoices
				</Button>
			</Card>

			{/* Usage */}
			<Card sx={{ p: 3 }}>
				<Typography variant="h4" sx={{ mb: 3 }}>
					{t('usage')}
				</Typography>

				<Stack spacing={3}>
					{[
						{
							name: 'Team members',
							used: 10,
							total: 25,
							icon: 'solar:users-group-rounded-bold',
						},
						{
							name: 'Workspaces',
							used: 3,
							total: 10,
							icon: 'solar:folder-with-files-bold',
						},
						{
							name: 'Social accounts',
							used: 7,
							total: 15,
							icon: 'solar:share-bold',
						},
						{
							name: 'Scheduled posts',
							used: 45,
							total: 100,
							icon: 'solar:calendar-bold',
						},
					].map((item) => (
						<Box key={item.name}>
							<Stack
								direction="row"
								alignItems="center"
								justifyContent="space-between"
								sx={{ mb: 1 }}
							>
								<Typography variant="body2">{item.name}</Typography>
								<Typography variant="body2" sx={{ color: 'text.secondary' }}>
									{item.used} / {item.total}
								</Typography>
							</Stack>
							<LinearProgress
								variant="determinate"
								value={(item.used / item.total) * 100}
								sx={{ height: 6, borderRadius: 3 }}
							/>
						</Box>
					))}
				</Stack>
			</Card>
		</Stack>
	);
};

export default SettingsBillingPage;
