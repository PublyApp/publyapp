import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useState } from 'react';
import { data, useParams } from 'react-router';
import { varAlpha } from 'minimal-shared/utils';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify, type IconifyProps } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/analytics-page';

// ----------------------------------------------------------------------

type DateRangeOption = '7' | '30' | '90';

type StatCardProps = {
	title: string;
	value: string | number;
	icon: IconifyProps['icon'];
	color: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';
	subtitle?: string;
};

// ----------------------------------------------------------------------

const StatCard = ({ title, value, icon, color, subtitle }: StatCardProps) => {
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
					<Typography variant="h3">
						{typeof value === 'number' ? value.toLocaleString() : value}
					</Typography>
					{subtitle && (
						<Typography variant="body2" sx={{ mt: 0.5, opacity: 0.72 }}>
							{subtitle}
						</Typography>
					)}
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

type ChartPlaceholderProps = {
	title: string;
	subheader?: string;
	height?: number;
	icon: IconifyProps['icon'];
};

const ChartPlaceholder = ({
	title,
	subheader,
	height = 300,
	icon,
}: ChartPlaceholderProps) => {
	return (
		<Card sx={{ height: '100%' }}>
			<CardHeader title={title} subheader={subheader} />
			<CardContent>
				<Box
					sx={{
						height,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						bgcolor: 'grey.100',
						borderRadius: 2,
						border: '2px dashed',
						borderColor: 'grey.300',
					}}
				>
					<Iconify icon={icon} width={64} sx={{ color: 'grey.400', mb: 2 }} />
					<Typography variant="body2" color="text.secondary">
						Chart coming soon
					</Typography>
					<Typography variant="caption" color="text.disabled">
						Connect your social accounts to see data
					</Typography>
				</Box>
			</CardContent>
		</Card>
	);
};

// ----------------------------------------------------------------------

// Mock data for top posts
const MOCK_TOP_POSTS = [
	{
		id: '1',
		title: 'How to grow your audience on Instagram',
		platform: 'Instagram',
		engagement: 1250,
		reach: 15000,
		date: '2024-12-28',
	},
	{
		id: '2',
		title: 'Top 10 marketing tips for 2025',
		platform: 'Twitter',
		engagement: 890,
		reach: 12000,
		date: '2024-12-27',
	},
	{
		id: '3',
		title: 'Behind the scenes of our product launch',
		platform: 'LinkedIn',
		engagement: 650,
		reach: 8500,
		date: '2024-12-26',
	},
	{
		id: '4',
		title: 'Customer success story: Acme Corp',
		platform: 'Facebook',
		engagement: 420,
		reach: 6200,
		date: '2024-12-25',
	},
	{
		id: '5',
		title: 'Weekly newsletter recap',
		platform: 'LinkedIn',
		engagement: 380,
		reach: 5100,
		date: '2024-12-24',
	},
];

// Mock statistics based on date range
const getMockStats = (days: DateRangeOption) => {
	const multiplier = days === '7' ? 1 : days === '30' ? 4 : 12;

	return {
		totalPosts: 12 * multiplier,
		totalEngagement: 3500 * multiplier,
		totalReach: 45000 * multiplier,
		avgEngagementRate: '4.2%',
	};
};

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('analytics'));

	if (seo) {
		str = `${str} | ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

// ----------------------------------------------------------------------

const AnalyticsPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const [dateRange, setDateRange] = useState<DateRangeOption>('30');

	const stats = getMockStats(dateRange);

	const handleDateRangeChange = (event: SelectChangeEvent) => {
		setDateRange(event.target.value as DateRangeOption);
	};

	const getDateRangeLabel = (days: DateRangeOption) => {
		switch (days) {
			case '7':
				return t('last-n-days', { n: 7 });
			case '30':
				return t('last-n-days', { n: 30 });
			case '90':
				return t('last-n-days', { n: 90 });
			default:
				return t('last-n-days', { n: 30 });
		}
	};

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			maxWidth="xl"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('dashboard')),
						href: FRONT_PATH_NAMES.tenant(tenantId).root,
					},
					{ name: _.capitalize(t('analytics')) },
				]}
				action={
					<FormControl size="small" sx={{ minWidth: 150 }}>
						<InputLabel id="date-range-select-label">
							{_.capitalize(t('date-range'))}
						</InputLabel>
						<Select
							labelId="date-range-select-label"
							id="date-range-select"
							value={dateRange}
							label={_.capitalize(t('date-range'))}
							onChange={handleDateRangeChange}
						>
							<MenuItem value="7">{getDateRangeLabel('7')}</MenuItem>
							<MenuItem value="30">{getDateRangeLabel('30')}</MenuItem>
							<MenuItem value="90">{getDateRangeLabel('90')}</MenuItem>
						</Select>
					</FormControl>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Grid container spacing={3}>
				{/* Summary Stats Row */}
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={_.capitalize(t('total-posts'))}
						value={stats.totalPosts}
						icon="solar:document-bold-duotone"
						color="primary"
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={_.capitalize(t('total-engagement'))}
						value={stats.totalEngagement}
						icon="solar:heart-bold-duotone"
						color="info"
						subtitle={t('likes-comments-shares')}
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={_.capitalize(t('total-reach'))}
						value={stats.totalReach}
						icon="solar:eye-bold-duotone"
						color="warning"
						subtitle={t('impressions')}
					/>
				</Grid>

				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<StatCard
						title={_.capitalize(t('avg-engagement-rate'))}
						value={stats.avgEngagementRate}
						icon="solar:chart-bold-duotone"
						color="success"
					/>
				</Grid>

				{/* Charts Section */}
				<Grid size={{ xs: 12, md: 8 }}>
					<ChartPlaceholder
						title={_.capitalize(t('engagement-over-time'))}
						subheader={t('track-engagement-trends')}
						height={364}
						icon="solar:chart-2-bold-duotone"
					/>
				</Grid>

				<Grid size={{ xs: 12, md: 4 }}>
					<ChartPlaceholder
						title={_.capitalize(t('posts-by-platform'))}
						subheader={t('distribution-across-platforms')}
						height={364}
						icon="solar:pie-chart-2-bold-duotone"
					/>
				</Grid>

				{/* Top Posts Section */}
				<Grid size={{ xs: 12 }}>
					<Card>
						<CardHeader
							title={_.capitalize(t('top-performing-posts'))}
							subheader={t('posts-with-highest-engagement')}
						/>
						<CardContent>
							<TableContainer>
								<Table>
									<TableHead>
										<TableRow>
											<TableCell>{_.capitalize(t('post'))}</TableCell>
											<TableCell>{_.capitalize(t('platform'))}</TableCell>
											<TableCell align="right">
												{_.capitalize(t('engagement'))}
											</TableCell>
											<TableCell align="right">
												{_.capitalize(t('reach'))}
											</TableCell>
											<TableCell align="right">
												{_.capitalize(t('date'))}
											</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{MOCK_TOP_POSTS.map((post) => (
											<TableRow key={post.id} hover>
												<TableCell>
													<Typography
														variant="body2"
														sx={{
															maxWidth: 300,
															overflow: 'hidden',
															textOverflow: 'ellipsis',
															whiteSpace: 'nowrap',
														}}
													>
														{post.title}
													</Typography>
												</TableCell>
												<TableCell>
													<Box
														sx={{
															display: 'flex',
															alignItems: 'center',
															gap: 1,
														}}
													>
														<Iconify
															icon={getPlatformIcon(post.platform)}
															width={20}
															sx={{ color: getPlatformColor(post.platform) }}
														/>
														<Typography variant="body2">
															{post.platform}
														</Typography>
													</Box>
												</TableCell>
												<TableCell align="right">
													{post.engagement.toLocaleString()}
												</TableCell>
												<TableCell align="right">
													{post.reach.toLocaleString()}
												</TableCell>
												<TableCell align="right">
													<Typography variant="body2" color="text.secondary">
														{post.date}
													</Typography>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</TableContainer>
						</CardContent>
					</Card>
				</Grid>
			</Grid>
		</DashboardContent>
	);
};

// ----------------------------------------------------------------------

const getPlatformIcon = (platform: string): IconifyProps['icon'] => {
	switch (platform.toLowerCase()) {
		case 'instagram':
			return 'skill-icons:instagram';
		case 'twitter':
			return 'skill-icons:twitter';
		case 'linkedin':
			return 'skill-icons:linkedin';
		case 'facebook':
			return 'logos:facebook';
		default:
			return 'solar:globe-bold-duotone';
	}
};

const getPlatformColor = (platform: string): string => {
	switch (platform.toLowerCase()) {
		case 'instagram':
			return '#E4405F';
		case 'twitter':
			return '#1DA1F2';
		case 'linkedin':
			return '#0A66C2';
		case 'facebook':
			return '#1877F2';
		default:
			return 'text.secondary';
	}
};

// ----------------------------------------------------------------------

export default AnalyticsPage;
