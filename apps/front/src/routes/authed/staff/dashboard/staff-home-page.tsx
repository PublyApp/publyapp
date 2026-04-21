import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';
import type { ReactNode } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';

// ----------------------------------------------------------------------

type KpiMock = {
	id: string;
	label: string;
	icon: IconifyName;
	value: number;
	deltaPct: number;
	positive: boolean;
};

type CompetitorMock = {
	name: string;
	sharePct: number;
	count: number;
	color: string;
};

type SparkBarPoint = {
	id: string;
	value: number;
};

const DASHBOARD_INSPIRATION = {
	dateRangeLabel: '1 Oct – 30 Oct, 2025',
	kpis: [
		{
			id: 'totalTenants',
			label: 'total-tenants',
			icon: 'solar:home-angle-bold-duotone',
			value: 156,
			deltaPct: 12.4,
			positive: true,
		},
		{
			id: 'staffUsers',
			label: 'staff-users',
			icon: 'solar:users-group-rounded-bold',
			value: 24,
			deltaPct: 3.1,
			positive: true,
		},
		{
			id: 'activeInvitations',
			label: 'active-invitations',
			icon: 'solar:letter-unread-bold',
			value: 8,
			deltaPct: 2.0,
			positive: false,
		},
		{
			id: 'profiles',
			label: 'profiles',
			icon: 'solar:user-id-bold',
			value: 42,
			deltaPct: 6.7,
			positive: true,
		},
	] satisfies KpiMock[],
	uniqueVisitors: {
		title: 'Active tenants (30d)',
		value: 8451,
		deltaPct: 12.5,
		positive: true,
		bars: [
			{ id: 'day-01', value: 12 },
			{ id: 'day-02', value: 18 },
			{ id: 'day-03', value: 14 },
			{ id: 'day-04', value: 22 },
			{ id: 'day-05', value: 30 },
			{ id: 'day-06', value: 26 },
			{ id: 'day-07', value: 34 },
			{ id: 'day-08', value: 28 },
			{ id: 'day-09', value: 36 },
			{ id: 'day-10', value: 40 },
			{ id: 'day-11', value: 38 },
			{ id: 'day-12', value: 44 },
			{ id: 'day-13', value: 42 },
			{ id: 'day-14', value: 48 },
			{ id: 'day-15', value: 52 },
			{ id: 'day-16', value: 49 },
			{ id: 'day-17', value: 55 },
			{ id: 'day-18', value: 58 },
			{ id: 'day-19', value: 54 },
			{ id: 'day-20', value: 60 },
			{ id: 'day-21', value: 62 },
			{ id: 'day-22', value: 58 },
			{ id: 'day-23', value: 64 },
			{ id: 'day-24', value: 68 },
			{ id: 'day-25', value: 70 },
			{ id: 'day-26', value: 66 },
			{ id: 'day-27', value: 72 },
			{ id: 'day-28', value: 76 },
			{ id: 'day-29', value: 74 },
			{ id: 'day-30', value: 78 },
		] satisfies SparkBarPoint[],
	},
	citationRank: {
		title: 'Platform share',
		rankLabel: '#1',
		segments: [
			{ pct: 38, color: '#3b82f6' },
			{ pct: 24, color: '#6366f1' },
			{ pct: 18, color: '#8b5cf6' },
			{ pct: 12, color: '#a855f7' },
			{ pct: 8, color: '#c084fc' },
		],
		competitors: [
			{ name: 'Ace', sharePct: 38, count: 3210, color: '#3b82f6' },
			{ name: 'Deel', sharePct: 24, count: 2044, color: '#6366f1' },
			{ name: 'Ramp', sharePct: 18, count: 1520, color: '#8b5cf6' },
			{ name: 'Mercury', sharePct: 12, count: 1012, color: '#a855f7' },
			{ name: 'Others', sharePct: 8, count: 665, color: '#c084fc' },
		] satisfies CompetitorMock[],
	},
	visibility: {
		title: 'Health score',
		valuePct: 32.1,
		deltaPct: 4.2,
		positive: true,
		points: [
			18, 22, 20, 26, 24, 30, 28, 32, 30, 34, 32, 36, 34, 38, 36, 40, 38, 42,
			40, 44,
		],
	},
	referrals: {
		title: 'Cross-tenant events',
		value: 13421,
		deltaPct: 8.1,
		positive: true,
		bars: [
			{ id: 'event-01', value: 28 },
			{ id: 'event-02', value: 32 },
			{ id: 'event-03', value: 30 },
			{ id: 'event-04', value: 36 },
			{ id: 'event-05', value: 34 },
			{ id: 'event-06', value: 40 },
			{ id: 'event-07', value: 38 },
			{ id: 'event-08', value: 44 },
			{ id: 'event-09', value: 42 },
			{ id: 'event-10', value: 48 },
			{ id: 'event-11', value: 46 },
			{ id: 'event-12', value: 52 },
			{ id: 'event-13', value: 50 },
			{ id: 'event-14', value: 56 },
			{ id: 'event-15', value: 54 },
			{ id: 'event-16', value: 60 },
			{ id: 'event-17', value: 58 },
			{ id: 'event-18', value: 62 },
			{ id: 'event-19', value: 60 },
			{ id: 'event-20', value: 64 },
		] satisfies SparkBarPoint[],
	},
	activity: [
		{
			id: '1',
			title: 'Tenant “Northwind” passed review',
			time: '2h ago',
			tone: 'success' as const,
		},
		{
			id: '2',
			title: 'Staff invite sent to ops@example.com',
			time: '5h ago',
			tone: 'info' as const,
		},
		{
			id: '3',
			title: 'Invitation expired for legacy org',
			time: 'Yesterday',
			tone: 'warning' as const,
		},
	],
};

const TrendDelta = ({
	deltaPct,
	positive,
	sx,
}: {
	deltaPct: number;
	positive: boolean;
	sx?: SxProps<Theme>;
}) => (
	<Typography
		component="span"
		variant="caption"
		sx={[
			{
				fontWeight: 600,
				fontSize: 11,
				color: positive ? 'success.main' : 'error.main',
			},
			...(Array.isArray(sx) ? sx : [sx]),
		]}
	>
		{positive ? '+' : '−'}
		{Math.abs(deltaPct).toFixed(1)}%
	</Typography>
);

const maxOf = (values: number[]) => {
	let max = 0;
	for (const v of values) {
		if (v > max) {
			max = v;
		}
	}
	return max === 0 ? 1 : max;
};

const SparkBars = ({
	values,
	barColor,
	gap = 2,
	height = 120,
	thin = false,
}: {
	values: SparkBarPoint[];
	barColor: string;
	gap?: number;
	height?: number;
	thin?: boolean;
}) => {
	const max = maxOf(
		values.map((bar) => {
			return bar.value;
		}),
	);
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'flex-end',
				gap,
				height,
				width: '100%',
			}}
		>
			{values.map((bar) => (
				<Box
					key={bar.id}
					sx={{
						flex: 1,
						minWidth: thin ? 2 : 4,
						borderRadius: 0.5,
						height: `${(bar.value / max) * 100}%`,
						backgroundColor: barColor,
					}}
				/>
			))}
		</Box>
	);
};

const SparkLineSvg = ({
	points,
	stroke,
	height = 96,
}: {
	points: number[];
	stroke: string;
	height?: number;
}) => {
	const max = maxOf(points);
	const min = 0;
	const range = max - min || 1;
	const w = 320;
	const pad = 4;
	const step = (w - pad * 2) / Math.max(points.length - 1, 1);
	const coords: string[] = [];
	for (let i = 0; i < points.length; i++) {
		const x = pad + i * step;
		const y = height - pad - ((points[i] - min) / range) * (height - pad * 2);
		coords.push(`${x},${y}`);
	}
	const d = `M ${coords.join(' L ')}`;
	return (
		<Box sx={{ width: '100%', height }}>
			<svg
				width="100%"
				height={height}
				viewBox={`0 0 ${w} ${height}`}
				preserveAspectRatio="none"
				aria-hidden
			>
				<title>Sparkline</title>
				<path
					d={d}
					fill="none"
					stroke={stroke}
					strokeWidth={2}
					strokeLinejoin="round"
					strokeLinecap="round"
				/>
			</svg>
		</Box>
	);
};

const SegmentedBar = ({
	segments,
}: {
	segments: Array<{ pct: number; color: string }>;
}) => (
	<Box
		sx={{
			display: 'flex',
			height: 10,
			borderRadius: 5,
			overflow: 'hidden',
			width: '100%',
			backgroundColor: (theme) => varAlpha(theme.vars.palette.grey[500], 0.12),
		}}
	>
		{segments.map((s) => (
			<Box
				key={s.color}
				sx={{
					width: `${s.pct}%`,
					backgroundColor: s.color,
				}}
			/>
		))}
	</Box>
);

const InspirationPageHeader = ({
	breadcrumb,
	title,
	subtitle,
	actions,
	sx,
}: {
	breadcrumb: string;
	title: string;
	subtitle: string;
	actions?: ReactNode;
	sx?: SxProps<Theme>;
}) => (
	<Stack
		direction={{ xs: 'column', md: 'row' }}
		spacing={2}
		sx={[
			{
				alignItems: { xs: 'stretch', md: 'flex-start' },
				justifyContent: 'space-between',
				mb: 2.5,
			},
			...(Array.isArray(sx) ? sx : [sx]),
		]}
	>
		<Box>
			<Typography
				variant="caption"
				sx={{
					color: 'text.secondary',
					letterSpacing: '0.06em',
					textTransform: 'uppercase',
					fontWeight: 600,
					fontSize: 11,
				}}
			>
				{breadcrumb}
			</Typography>
			<Typography
				variant="h4"
				sx={{ mt: 0.75, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.2 }}
			>
				{title}
			</Typography>
			<Typography
				variant="body2"
				sx={{
					color: 'text.secondary',
					mt: 0.75,
					maxWidth: 560,
					lineHeight: 1.6,
				}}
			>
				{subtitle}
			</Typography>
		</Box>
		{actions ? <Box sx={{ flexShrink: 0 }}>{actions}</Box> : null}
	</Stack>
);

const InspirationToolbar = ({
	dateRangeLabel,
	onAskAi,
}: {
	dateRangeLabel: string;
	onAskAi?: () => void;
}) => (
	<Stack
		direction={{ xs: 'column', sm: 'row' }}
		spacing={1}
		sx={{ alignItems: { xs: 'stretch', sm: 'center' }, flexWrap: 'wrap' }}
	>
		<IconButton
			size="small"
			sx={{
				border: '1px solid',
				borderColor: 'divider',
				borderRadius: 1.25,
				bgcolor: 'background.paper',
			}}
		>
			<Iconify icon="eva:search-fill" width={18} />
		</IconButton>
		<Button
			variant="outlined"
			color="inherit"
			size="small"
			startIcon={<Iconify icon="solar:calendar-date-bold" width={16} />}
			sx={{
				borderRadius: 1.25,
				textTransform: 'none',
				fontWeight: 500,
				borderColor: 'divider',
				bgcolor: 'background.paper',
			}}
		>
			{dateRangeLabel}
		</Button>
		<Button
			variant="outlined"
			color="inherit"
			size="small"
			sx={{
				borderRadius: 1.25,
				textTransform: 'none',
				fontWeight: 500,
				borderColor: 'divider',
				bgcolor: 'background.paper',
			}}
		>
			Export snapshot
		</Button>
		<Button
			variant="contained"
			color="primary"
			size="small"
			onClick={onAskAi}
			startIcon={<Iconify icon="solar:cup-star-bold" width={16} />}
			sx={{
				borderRadius: 1.25,
				textTransform: 'none',
				fontWeight: 600,
				boxShadow: 'none',
			}}
		>
			New insight
		</Button>
	</Stack>
);

const CompetitorList = ({ competitors }: { competitors: CompetitorMock[] }) => (
	<Stack spacing={1.25}>
		{competitors.map((c, index) => (
			<Box key={c.name}>
				<Stack direction="row" spacing={1.5} alignItems="center">
					<Box
						sx={{
							width: 28,
							height: 28,
							borderRadius: 1,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: alpha(c.color, 0.12),
							color: c.color,
							fontSize: 12,
							fontWeight: 800,
						}}
					>
						{c.name.slice(0, 1)}
					</Box>
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
							{c.name}
						</Typography>
					</Box>
					<Typography
						variant="caption"
						sx={{ color: 'text.secondary', fontWeight: 600 }}
					>
						{c.sharePct}%
					</Typography>
					<Typography variant="caption" sx={{ fontWeight: 700 }}>
						{c.count.toLocaleString()}
					</Typography>
				</Stack>
				{index < competitors.length - 1 ? <Divider sx={{ mt: 1.25 }} /> : null}
			</Box>
		))}
	</Stack>
);

type ActivityTone = 'success' | 'info' | 'warning';

const ActivityFeed = ({
	items,
}: {
	items: Array<{ id: string; title: string; time: string; tone: ActivityTone }>;
}) => {
	const toneColor = (tone: ActivityTone) => {
		if (tone === 'success') {
			return 'success.main';
		}
		if (tone === 'warning') {
			return 'warning.main';
		}
		return 'info.main';
	};
	return (
		<Stack spacing={1.5}>
			{items.map((item) => (
				<Stack
					key={item.id}
					direction="row"
					spacing={1.5}
					alignItems="flex-start"
				>
					<Box
						sx={{
							mt: 0.35,
							width: 8,
							height: 8,
							borderRadius: '50%',
							backgroundColor: toneColor(item.tone),
							flexShrink: 0,
						}}
					/>
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Typography variant="body2" sx={{ fontWeight: 600 }}>
							{item.title}
						</Typography>
						<Typography variant="caption" sx={{ color: 'text.secondary' }}>
							{item.time}
						</Typography>
					</Box>
				</Stack>
			))}
		</Stack>
	);
};

// ----------------------------------------------------------------------

const StaffHomePage = () => {
	const { t } = useTranslate();
	const theme = useTheme();
	const accent = theme.vars.palette.primary.main;

	return (
		<DashboardContent maxWidth="lg" compact>
			<InspirationPageHeader
				breadcrumb={`${t('welcome-back')} / Overview`}
				title={t('welcome-back')}
				subtitle="Primary column for the main metric; supporting KPIs stay quiet beside it."
				actions={
					<InspirationToolbar
						dateRangeLabel={DASHBOARD_INSPIRATION.dateRangeLabel}
					/>
				}
			/>

			<Grid container spacing={2} sx={{ mb: 2 }}>
				<Grid size={{ xs: 12, lg: 8 }}>
					<Card
						sx={{
							p: 2.5,
							height: '100%',
							bgcolor: (th) => alpha(th.palette.primary.main, 0.05),
						}}
					>
						<Stack
							direction="row"
							justifyContent="space-between"
							alignItems="flex-start"
							sx={{ mb: 2 }}
						>
							<Box>
								<Typography
									variant="caption"
									sx={{
										fontWeight: 500,
										color: 'text.secondary',
										letterSpacing: '0.04em',
										textTransform: 'uppercase',
									}}
								>
									{DASHBOARD_INSPIRATION.uniqueVisitors.title}
								</Typography>
								<Stack
									direction="row"
									spacing={1}
									alignItems="baseline"
									sx={{ mt: 1 }}
									flexWrap="wrap"
								>
									<Typography
										variant="h2"
										sx={{
											fontWeight: 600,
											letterSpacing: -0.8,
											fontSize: { xs: 28, md: 34 },
										}}
									>
										{DASHBOARD_INSPIRATION.uniqueVisitors.value.toLocaleString()}
									</Typography>
									<TrendDelta
										deltaPct={DASHBOARD_INSPIRATION.uniqueVisitors.deltaPct}
										positive={DASHBOARD_INSPIRATION.uniqueVisitors.positive}
									/>
								</Stack>
								<Typography
									variant="body2"
									sx={{
										color: 'text.secondary',
										mt: 1.25,
										maxWidth: 480,
										lineHeight: 1.6,
									}}
								>
									Thirty-day pulse across the busiest tenants — your
									first-glance health read.
								</Typography>
							</Box>
							<Iconify
								icon="solar:chart-2-bold-duotone"
								width={32}
								sx={{ color: 'text.disabled' }}
							/>
						</Stack>
						<SparkBars
							values={DASHBOARD_INSPIRATION.uniqueVisitors.bars}
							barColor={accent}
							height={170}
						/>
					</Card>
				</Grid>

				<Grid size={{ xs: 12, lg: 4 }}>
					<Stack spacing={1.75} sx={{ height: '100%' }}>
						{DASHBOARD_INSPIRATION.kpis.map((kpi) => (
							<Card key={kpi.id} sx={{ p: 1.75 }}>
								<Stack direction="row" spacing={1.5} alignItems="center">
									<Box
										sx={{
											width: 40,
											height: 40,
											borderRadius: 1.25,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											bgcolor: 'background.neutral',
										}}
									>
										<Iconify
											icon={kpi.icon}
											width={20}
											sx={{ color: 'text.secondary' }}
										/>
									</Box>
									<Box sx={{ flex: 1, minWidth: 0 }}>
										<Typography
											variant="caption"
											sx={{ color: 'text.secondary', fontWeight: 500 }}
										>
											{t(
												kpi.label as
													| 'total-tenants'
													| 'staff-users'
													| 'active-invitations'
													| 'profiles',
											)}
										</Typography>
										<Stack
											direction="row"
											spacing={1}
											alignItems="baseline"
											flexWrap="wrap"
										>
											<Typography
												variant="h6"
												sx={{ fontWeight: 600, letterSpacing: -0.3 }}
											>
												{kpi.value.toLocaleString()}
											</Typography>
											<TrendDelta
												deltaPct={kpi.deltaPct}
												positive={kpi.positive}
											/>
										</Stack>
									</Box>
								</Stack>
							</Card>
						))}
					</Stack>
				</Grid>
			</Grid>

			<Grid container spacing={2}>
				<Grid size={{ xs: 12, md: 6 }}>
					<Card sx={{ p: 2.25, height: '100%' }}>
						<Stack
							direction="row"
							justifyContent="space-between"
							sx={{ mb: 2 }}
						>
							<Typography
								variant="subtitle2"
								sx={{ fontWeight: 500, color: 'text.secondary' }}
							>
								{DASHBOARD_INSPIRATION.citationRank.title}
							</Typography>
							<Typography
								variant="h5"
								sx={{ fontWeight: 600, letterSpacing: -0.4 }}
							>
								{DASHBOARD_INSPIRATION.citationRank.rankLabel}
							</Typography>
						</Stack>
						<SegmentedBar
							segments={DASHBOARD_INSPIRATION.citationRank.segments}
						/>
						<Box sx={{ mt: 2 }}>
							<CompetitorList
								competitors={DASHBOARD_INSPIRATION.citationRank.competitors}
							/>
						</Box>
					</Card>
				</Grid>

				<Grid size={{ xs: 12, md: 6 }}>
					<Stack spacing={2} sx={{ height: '100%' }}>
						<Card sx={{ p: 2.25 }}>
							<Typography
								variant="subtitle2"
								sx={{ fontWeight: 500, color: 'text.secondary', mb: 1 }}
							>
								{DASHBOARD_INSPIRATION.visibility.title}
							</Typography>
							<Stack
								direction="row"
								spacing={1}
								alignItems="baseline"
								sx={{ mb: 1 }}
								flexWrap="wrap"
							>
								<Typography
									variant="h5"
									sx={{ fontWeight: 600, letterSpacing: -0.4 }}
								>
									{DASHBOARD_INSPIRATION.visibility.valuePct.toFixed(1)}%
								</Typography>
								<TrendDelta
									deltaPct={DASHBOARD_INSPIRATION.visibility.deltaPct}
									positive={DASHBOARD_INSPIRATION.visibility.positive}
								/>
							</Stack>
							<SparkLineSvg
								points={DASHBOARD_INSPIRATION.visibility.points}
								stroke={accent}
								height={100}
							/>
						</Card>
						<Card sx={{ p: 2.25 }}>
							<Typography
								variant="subtitle2"
								sx={{ fontWeight: 500, color: 'text.secondary', mb: 1 }}
							>
								{DASHBOARD_INSPIRATION.referrals.title}
							</Typography>
							<Stack
								direction="row"
								spacing={1}
								alignItems="baseline"
								sx={{ mb: 1.5 }}
								flexWrap="wrap"
							>
								<Typography
									variant="h5"
									sx={{ fontWeight: 600, letterSpacing: -0.4 }}
								>
									{DASHBOARD_INSPIRATION.referrals.value.toLocaleString()}
								</Typography>
								<TrendDelta
									deltaPct={DASHBOARD_INSPIRATION.referrals.deltaPct}
									positive={DASHBOARD_INSPIRATION.referrals.positive}
								/>
							</Stack>
							<SparkBars
								values={DASHBOARD_INSPIRATION.referrals.bars}
								barColor={accent}
								height={110}
							/>
						</Card>
					</Stack>
				</Grid>

				<Grid size={{ xs: 12 }}>
					<Card sx={{ p: 2.25 }}>
						<Typography
							variant="subtitle2"
							sx={{ fontWeight: 500, color: 'text.secondary', mb: 2 }}
						>
							Latest signals
						</Typography>
						<ActivityFeed items={DASHBOARD_INSPIRATION.activity} />
					</Card>
				</Grid>
			</Grid>
		</DashboardContent>
	);
};

export default StaffHomePage;
