import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useMemo, useState } from 'react';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Iconify, type IconifyProps } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/schedule-page';

// ----------------------------------------------------------------------

type SocialPlatform = 'all' | 'instagram' | 'twitter' | 'linkedin' | 'facebook';

type ScheduledPost = {
	id: string;
	title: string;
	platform: SocialPlatform;
	scheduledAt: string;
	status: 'scheduled' | 'published' | 'failed';
};

// Mock data for scheduled posts
const MOCK_SCHEDULED_POSTS: ScheduledPost[] = [
	{
		id: '1',
		title: 'New product announcement',
		platform: 'instagram',
		scheduledAt: dayjs()
			.add(2, 'day')
			.set('hour', 10)
			.set('minute', 0)
			.toISOString(),
		status: 'scheduled',
	},
	{
		id: '2',
		title: 'Weekly tips for entrepreneurs',
		platform: 'twitter',
		scheduledAt: dayjs()
			.add(3, 'day')
			.set('hour', 14)
			.set('minute', 30)
			.toISOString(),
		status: 'scheduled',
	},
	{
		id: '3',
		title: 'Behind the scenes video',
		platform: 'linkedin',
		scheduledAt: dayjs()
			.add(5, 'day')
			.set('hour', 9)
			.set('minute', 0)
			.toISOString(),
		status: 'scheduled',
	},
	{
		id: '4',
		title: 'Customer success story',
		platform: 'facebook',
		scheduledAt: dayjs()
			.add(7, 'day')
			.set('hour', 11)
			.set('minute', 0)
			.toISOString(),
		status: 'scheduled',
	},
	{
		id: '5',
		title: 'Holiday greetings',
		platform: 'instagram',
		scheduledAt: dayjs()
			.add(10, 'day')
			.set('hour', 8)
			.set('minute', 0)
			.toISOString(),
		status: 'scheduled',
	},
	{
		id: '6',
		title: 'Q1 Review blog post',
		platform: 'linkedin',
		scheduledAt: dayjs()
			.add(12, 'day')
			.set('hour', 16)
			.set('minute', 0)
			.toISOString(),
		status: 'scheduled',
	},
];

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('scheduled'));

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

const SchedulePage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();
	const theme = useTheme();

	const [currentDate, setCurrentDate] = useState(dayjs());
	const [platformFilter, setPlatformFilter] = useState<SocialPlatform>('all');

	// Filter posts based on selected platform
	const filteredPosts = useMemo(() => {
		if (platformFilter === 'all') {
			return MOCK_SCHEDULED_POSTS;
		}
		return MOCK_SCHEDULED_POSTS.filter(
			(post) => post.platform === platformFilter,
		);
	}, [platformFilter]);

	// Get posts for a specific day
	const getPostsForDay = (date: dayjs.Dayjs) => {
		return filteredPosts.filter((post) =>
			dayjs(post.scheduledAt).isSame(date, 'day'),
		);
	};

	// Generate calendar days for the current month
	const calendarDays = useMemo(() => {
		const startOfMonth = currentDate.startOf('month');
		const startDay = startOfMonth.day(); // 0 = Sunday
		const daysInMonth = currentDate.daysInMonth();

		const days: (dayjs.Dayjs | null)[] = [];

		// Add empty slots for days before the start of the month
		for (let i = 0; i < startDay; i++) {
			days.push(null);
		}

		// Add all days of the month
		for (let day = 1; day <= daysInMonth; day++) {
			days.push(startOfMonth.date(day));
		}

		// Add empty slots to complete the last week (optional, for visual consistency)
		const remainingSlots = 7 - (days.length % 7);
		if (remainingSlots < 7) {
			for (let i = 0; i < remainingSlots; i++) {
				days.push(null);
			}
		}

		return days;
	}, [currentDate]);

	const handlePrevMonth = () => {
		setCurrentDate(currentDate.subtract(1, 'month'));
	};

	const handleNextMonth = () => {
		setCurrentDate(currentDate.add(1, 'month'));
	};

	const handleToday = () => {
		setCurrentDate(dayjs());
	};

	const handlePlatformChange = (event: SelectChangeEvent) => {
		setPlatformFilter(event.target.value as SocialPlatform);
	};

	const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
					{ name: _.capitalize(t('scheduled')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.tenant(tenantId).posts.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{`${_.capitalize(t('new'))} ${t('post')}`}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
				{/* Calendar Toolbar */}
				<Box
					sx={{
						p: 2.5,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						borderBottom: `1px solid ${theme.vars.palette.divider}`,
					}}
				>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<IconButton onClick={handlePrevMonth} size="small">
							<Iconify icon="eva:arrow-ios-back-fill" />
						</IconButton>

						<Typography
							variant="h6"
							sx={{ minWidth: 180, textAlign: 'center' }}
						>
							{currentDate.format('MMMM YYYY')}
						</Typography>

						<IconButton onClick={handleNextMonth} size="small">
							<Iconify icon="eva:arrow-ios-forward-fill" />
						</IconButton>
					</Box>

					<Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
						<FormControl size="small" sx={{ minWidth: 150 }}>
							<InputLabel id="platform-filter-label">
								{_.capitalize(t('platform'))}
							</InputLabel>
							<Select
								labelId="platform-filter-label"
								id="platform-filter"
								value={platformFilter}
								label={_.capitalize(t('platform'))}
								onChange={handlePlatformChange}
							>
								<MenuItem value="all">{`${_.capitalize(t('all'))} ${t('platform')}s`}</MenuItem>
								<MenuItem value="instagram">
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
										<Iconify icon="skill-icons:instagram" width={18} />
										Instagram
									</Box>
								</MenuItem>
								<MenuItem value="twitter">
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
										<Iconify icon="skill-icons:twitter" width={18} />
										Twitter / X
									</Box>
								</MenuItem>
								<MenuItem value="linkedin">
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
										<Iconify icon="skill-icons:linkedin" width={18} />
										LinkedIn
									</Box>
								</MenuItem>
								<MenuItem value="facebook">
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
										<Iconify icon="logos:facebook" width={18} />
										Facebook
									</Box>
								</MenuItem>
							</Select>
						</FormControl>

						<Button
							size="small"
							color="error"
							variant="contained"
							onClick={handleToday}
						>
							Today
						</Button>
					</Box>
				</Box>

				{/* Calendar Grid */}
				<Box sx={{ flexGrow: 1, p: 2 }}>
					{/* Weekday Headers */}
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: 'repeat(7, 1fr)',
							mb: 1,
						}}
					>
						{weekDays.map((day) => (
							<Box
								key={day}
								sx={{
									py: 1,
									textAlign: 'center',
									fontWeight: 'bold',
									color: 'text.secondary',
								}}
							>
								<Typography variant="subtitle2">{day}</Typography>
							</Box>
						))}
					</Box>

					{/* Calendar Days */}
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: 'repeat(7, 1fr)',
							gap: 0.5,
						}}
					>
						{calendarDays.map((date, index) => {
							if (!date) {
								return (
									<Box
										key={`empty-${index}`}
										sx={{
											minHeight: 100,
											bgcolor: 'grey.50',
											borderRadius: 1,
										}}
									/>
								);
							}

							const postsForDay = getPostsForDay(date);
							const isToday = date.isSame(dayjs(), 'day');
							const isCurrentMonth = date.isSame(currentDate, 'month');

							return (
								<CalendarDayCell
									key={date.format('YYYY-MM-DD')}
									date={date}
									posts={postsForDay}
									isToday={isToday}
									isCurrentMonth={isCurrentMonth}
								/>
							);
						})}
					</Box>
				</Box>
			</Card>
		</DashboardContent>
	);
};

// ----------------------------------------------------------------------

type CalendarDayCellProps = {
	date: dayjs.Dayjs;
	posts: ScheduledPost[];
	isToday: boolean;
	isCurrentMonth: boolean;
};

const CalendarDayCell = ({
	date,
	posts,
	isToday,
	isCurrentMonth,
}: CalendarDayCellProps) => {
	const theme = useTheme();

	return (
		<Box
			sx={{
				minHeight: 100,
				p: 1,
				bgcolor: isToday
					? `${theme.vars.palette.primary.lighter}`
					: 'background.paper',
				border: `1px solid ${theme.vars.palette.divider}`,
				borderRadius: 1,
				opacity: isCurrentMonth ? 1 : 0.5,
				transition: 'background-color 0.2s',
				'&:hover': {
					bgcolor: isToday
						? `${theme.vars.palette.primary.light}`
						: 'action.hover',
				},
			}}
		>
			{/* Day Number */}
			<Box
				sx={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					mb: 0.5,
				}}
			>
				<Typography
					variant="body2"
					sx={{
						fontWeight: isToday ? 'bold' : 'normal',
						color: isToday ? 'primary.main' : 'text.primary',
					}}
				>
					{date.date()}
				</Typography>
				{posts.length > 0 && (
					<Box
						sx={{
							width: 20,
							height: 20,
							borderRadius: '50%',
							bgcolor: 'primary.main',
							color: 'primary.contrastText',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: 11,
							fontWeight: 'bold',
						}}
					>
						{posts.length}
					</Box>
				)}
			</Box>

			{/* Post Indicators */}
			<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
				{posts.slice(0, 2).map((post) => (
					<PostIndicator key={post.id} post={post} />
				))}
				{posts.length > 2 && (
					<Typography
						variant="caption"
						sx={{ color: 'text.secondary', fontSize: 10 }}
					>
						+{posts.length - 2} more
					</Typography>
				)}
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

type PostIndicatorProps = {
	post: ScheduledPost;
};

const PostIndicator = ({ post }: PostIndicatorProps) => {
	const platformColors: Record<SocialPlatform, string> = {
		all: '#666',
		instagram: '#E4405F',
		twitter: '#1DA1F2',
		linkedin: '#0A66C2',
		facebook: '#1877F2',
	};

	const platformIcons: Record<SocialPlatform, IconifyProps['icon']> = {
		all: 'solar:globe-bold-duotone',
		instagram: 'mdi:instagram',
		twitter: 'mdi:twitter',
		linkedin: 'mdi:linkedin',
		facebook: 'mdi:facebook',
	};

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 0.5,
				px: 0.5,
				py: 0.25,
				borderRadius: 0.5,
				bgcolor: `${platformColors[post.platform]}15`,
				borderLeft: `2px solid ${platformColors[post.platform]}`,
				overflow: 'hidden',
			}}
		>
			<Iconify
				icon={platformIcons[post.platform]}
				width={12}
				sx={{ color: platformColors[post.platform], flexShrink: 0 }}
			/>
			<Typography
				variant="caption"
				sx={{
					fontSize: 10,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					color: 'text.secondary',
				}}
			>
				{dayjs(post.scheduledAt).format('HH:mm')}
			</Typography>
		</Box>
	);
};

// ----------------------------------------------------------------------

export default SchedulePage;
