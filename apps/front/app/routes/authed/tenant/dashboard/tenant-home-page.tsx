import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
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

type RecentActivityItem = {
	id: string;
	title: string;
	type: 'published' | 'scheduled' | 'draft';
	timeAgo: string;
	platform?: string;
};

// Mock data - static for now
const MOCK_STATS = {
	scheduledPosts: 12,
	publishedPosts: 47,
	draftPosts: 8,
	socialAccounts: 4,
};

const MOCK_RECENT_ACTIVITY: RecentActivityItem[] = [
	{
		id: '1',
		title: 'New product launch announcement',
		type: 'published',
		timeAgo: '2 hours ago',
		platform: 'Twitter',
	},
	{
		id: '2',
		title: 'Weekly newsletter preview',
		type: 'scheduled',
		timeAgo: '4 hours ago',
		platform: 'LinkedIn',
	},
	{
		id: '3',
		title: 'Behind the scenes content',
		type: 'draft',
		timeAgo: '1 day ago',
	},
	{
		id: '4',
		title: 'Customer success story',
		type: 'published',
		timeAgo: '2 days ago',
		platform: 'Facebook',
	},
	{
		id: '5',
		title: 'Industry insights article',
		type: 'scheduled',
		timeAgo: '3 days ago',
		platform: 'LinkedIn',
	},
];

// ----------------------------------------------------------------------

const getActivityIcon = (
	type: RecentActivityItem['type'],
):
	| 'solar:check-circle-bold'
	| 'solar:clock-circle-bold'
	| 'solar:file-text-bold' => {
	const icons = {
		published: 'solar:check-circle-bold' as const,
		scheduled: 'solar:clock-circle-bold' as const,
		draft: 'solar:file-text-bold' as const,
	};
	return icons[type];
};

const getActivityColor = (
	type: RecentActivityItem['type'],
): 'success' | 'warning' | 'info' => {
	const colors = {
		published: 'success' as const,
		scheduled: 'warning' as const,
		draft: 'info' as const,
	};
	return colors[type];
};

// ----------------------------------------------------------------------

const TenantHomePage = () => {
	const { t } = useTranslate();

	return (
		<DashboardContent maxWidth="xl">
			{/* Welcome Section */}
			<Typography variant="h4" sx={{ mb: { xs: 3, md: 5 } }}>
				{t('welcome-back')}
			</Typography>

			{/* Stats Cards Row */}
			<Grid container spacing={3} sx={{ mb: 3 }}>
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('scheduled-posts')}
						total={MOCK_STATS.scheduledPosts}
						icon="solar:clock-circle-bold"
						color="warning"
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('published-posts')}
						total={MOCK_STATS.publishedPosts}
						icon="solar:check-circle-bold"
						color="success"
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('draft-posts')}
						total={MOCK_STATS.draftPosts}
						icon="solar:file-text-bold"
						color="info"
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={t('social-accounts')}
						total={MOCK_STATS.socialAccounts}
						icon="solar:share-bold"
						color="primary"
					/>
				</Grid>
			</Grid>

			{/* Recent Activity and Quick Actions Row */}
			<Grid container spacing={3}>
				{/* Recent Activity Section */}
				<Grid size={{ xs: 12, md: 8 }}>
					<Card>
						<CardHeader
							title={t('recent-activity')}
							action={
								<Link
									href="#"
									underline="hover"
									sx={{
										typography: 'body2',
										color: 'primary.main',
										cursor: 'pointer',
									}}
								>
									{t('view-all')}
								</Link>
							}
						/>
						<Divider />
						<CardContent sx={{ p: 0 }}>
							<List disablePadding>
								{MOCK_RECENT_ACTIVITY.map((activity, index) => (
									<ListItem
										key={activity.id}
										sx={{
											py: 2,
											px: 3,
											...(index !== MOCK_RECENT_ACTIVITY.length - 1 && {
												borderBottom: (theme) =>
													`1px dashed ${theme.vars.palette.divider}`,
											}),
										}}
									>
										<ListItemIcon sx={{ minWidth: 48 }}>
											<Box
												sx={{
													width: 40,
													height: 40,
													display: 'flex',
													borderRadius: '50%',
													alignItems: 'center',
													justifyContent: 'center',
													bgcolor: (theme) =>
														varAlpha(
															theme.vars.palette[
																getActivityColor(activity.type)
															].mainChannel,
															0.16,
														),
												}}
											>
												<Iconify
													icon={getActivityIcon(activity.type)}
													width={24}
													sx={{
														color: `${getActivityColor(activity.type)}.main`,
													}}
												/>
											</Box>
										</ListItemIcon>
										<ListItemText
											primary={activity.title}
											secondary={
												<Stack
													direction="row"
													spacing={1}
													alignItems="center"
													sx={{ mt: 0.5 }}
												>
													<Typography
														variant="caption"
														sx={{ color: 'text.secondary' }}
													>
														{activity.timeAgo}
													</Typography>
													{activity.platform && (
														<>
															<Box
																component="span"
																sx={{
																	width: 4,
																	height: 4,
																	borderRadius: '50%',
																	bgcolor: 'text.disabled',
																}}
															/>
															<Typography
																variant="caption"
																sx={{ color: 'text.secondary' }}
															>
																{activity.platform}
															</Typography>
														</>
													)}
												</Stack>
											}
											primaryTypographyProps={{
												variant: 'subtitle2',
												sx: { mb: 0.5 },
											}}
										/>
										<Box
											sx={{
												px: 1.5,
												py: 0.5,
												borderRadius: 1,
												typography: 'caption',
												textTransform: 'capitalize',
												fontWeight: 'fontWeightMedium',
												color: `${getActivityColor(activity.type)}.dark`,
												bgcolor: (theme) =>
													varAlpha(
														theme.vars.palette[getActivityColor(activity.type)]
															.mainChannel,
														0.16,
													),
											}}
										>
											{t(activity.type)}
										</Box>
									</ListItem>
								))}
							</List>
						</CardContent>
					</Card>
				</Grid>

				{/* Quick Actions Section */}
				<Grid size={{ xs: 12, md: 4 }}>
					<Card sx={{ height: '100%' }}>
						<CardHeader title={t('quick-actions')} />
						<Divider />
						<CardContent>
							<Stack spacing={2}>
								<Button
									variant="contained"
									color="primary"
									size="large"
									fullWidth
									startIcon={<Iconify icon="solar:add-circle-bold" />}
									sx={{
										justifyContent: 'flex-start',
										py: 1.5,
									}}
								>
									{t('create-post')}
								</Button>

								<Button
									variant="outlined"
									color="warning"
									size="large"
									fullWidth
									startIcon={<Iconify icon="solar:clock-circle-bold" />}
									sx={{
										justifyContent: 'flex-start',
										py: 1.5,
									}}
								>
									{t('schedule-post')}
								</Button>

								<Button
									variant="outlined"
									color="info"
									size="large"
									fullWidth
									startIcon={<Iconify icon="solar:share-bold" />}
									sx={{
										justifyContent: 'flex-start',
										py: 1.5,
									}}
								>
									{t('connect-account')}
								</Button>
							</Stack>

							{/* Additional info card */}
							<Box
								sx={{
									mt: 3,
									p: 2.5,
									borderRadius: 2,
									bgcolor: (theme) =>
										varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
								}}
							>
								<Stack direction="row" spacing={2} alignItems="flex-start">
									<Box
										sx={{
											width: 48,
											height: 48,
											display: 'flex',
											borderRadius: '50%',
											alignItems: 'center',
											justifyContent: 'center',
											bgcolor: (theme) =>
												varAlpha(theme.vars.palette.primary.mainChannel, 0.16),
										}}
									>
										<Iconify
											icon="solar:cup-star-bold"
											width={28}
											sx={{ color: 'primary.main' }}
										/>
									</Box>
									<Box sx={{ flex: 1 }}>
										<Typography
											variant="subtitle2"
											sx={{ mb: 0.5, color: 'primary.dark' }}
										>
											Pro Tip
										</Typography>
										<Typography
											variant="body2"
											sx={{ color: 'text.secondary' }}
										>
											Schedule your posts during peak engagement hours for
											better reach and interaction.
										</Typography>
									</Box>
								</Stack>
							</Box>
						</CardContent>
					</Card>
				</Grid>
			</Grid>
		</DashboardContent>
	);
};

export default TenantHomePage;
