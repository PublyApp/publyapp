import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { Iconify, type IconifyProps } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';

// ----------------------------------------------------------------------

type StatCardProps = {
	title: string;
	total: number;
	icon: IconifyProps['icon'];
	color: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';
};

const StatCard = ({ title, total, icon, color }: StatCardProps) => {
	const theme = useTheme();

	return (
		<Card
			sx={{
				p: 3,
				boxShadow: 'none',
				position: 'relative',
				color: `${color}.darker`,
				backgroundColor: 'common.white',
				backgroundImage: `linear-gradient(135deg, ${varAlpha(theme.vars.palette[color].lighterChannel, 0.48)}, ${varAlpha(theme.vars.palette[color].lightChannel, 0.48)})`,
				overflow: 'hidden',
			}}
		>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<Box>
					<Typography variant="subtitle2" sx={{ mb: 1, opacity: 0.72 }}>
						{title}
					</Typography>
					<Typography variant="h3">{total.toLocaleString()}</Typography>
				</Box>

				<Box
					sx={{
						width: 64,
						height: 64,
						display: 'flex',
						borderRadius: '50%',
						alignItems: 'center',
						justifyContent: 'center',
						bgcolor: varAlpha(theme.vars.palette[color].mainChannel, 0.16),
					}}
				>
					<Iconify icon={icon} width={36} sx={{ color: `${color}.main` }} />
				</Box>
			</Box>

			{/* Decorative shape */}
			<Box
				sx={{
					top: -44,
					width: 160,
					zIndex: 0,
					height: 160,
					right: -104,
					opacity: 0.12,
					borderRadius: 3,
					position: 'absolute',
					transform: 'rotate(40deg)',
					bgcolor: `${color}.darker`,
				}}
			/>
		</Card>
	);
};

// ----------------------------------------------------------------------

// Mock data - static numbers for now
const MOCK_STATS = {
	totalTenants: 156,
	totalStaffMembers: 24,
	activeInvitations: 8,
	totalProfiles: 42,
};

// ----------------------------------------------------------------------

const StaffHomePage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent maxWidth="xl">
			<Typography variant="h4" sx={{ mb: { xs: 3, md: 5 } }}>
				{t('welcome-back')}
			</Typography>

			<Grid container spacing={3}>
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('total-tenants')}
						total={MOCK_STATS.totalTenants}
						icon="solar:home-angle-bold-duotone"
						color="primary"
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('staff-members')}
						total={MOCK_STATS.totalStaffMembers}
						icon="solar:users-group-rounded-bold"
						color="info"
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('active-invitations')}
						total={MOCK_STATS.activeInvitations}
						icon="solar:letter-unread-bold"
						color="warning"
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('profiles')}
						total={MOCK_STATS.totalProfiles}
						icon="solar:user-id-bold"
						color="success"
					/>
				</Grid>
			</Grid>
		</DashboardContent>
	);
};

export default StaffHomePage;
