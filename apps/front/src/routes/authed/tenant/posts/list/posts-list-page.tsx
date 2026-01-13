import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useState } from 'react';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label/label';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/posts-list-page';

// ----------------------------------------------------------------------

const POST_STATUS_OPTIONS = ['all', 'draft', 'scheduled', 'published'] as const;

type PostStatus = (typeof POST_STATUS_OPTIONS)[number];

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction) => {
	return _.capitalize(t('posts'));
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: `${getPageTitle(t)} | ${APP_NAME}`,
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: `${getPageTitle(t)} | ${APP_NAME}`,
				},
			],
		});
	},
});

// ----------------------------------------------------------------------

const PostsListPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams();

	const [currentStatus, setCurrentStatus] = useState<PostStatus>('all');
	const [searchQuery, setSearchQuery] = useState('');

	// Mock counts for demonstration - will be replaced with actual API data
	const statusCounts = {
		all: 0,
		draft: 0,
		scheduled: 0,
		published: 0,
	};

	const handleStatusChange = (
		_event: React.SyntheticEvent,
		newValue: PostStatus,
	) => {
		setCurrentStatus(newValue);
	};

	const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(event.target.value);
	};

	const getStatusLabel = (status: PostStatus): string => {
		switch (status) {
			case 'all':
				return t('all');
			case 'draft':
				return t('draft');
			case 'scheduled':
				return t('scheduled');
			case 'published':
				return t('published');
			default:
				return status;
		}
	};

	const getStatusColor = (
		status: PostStatus,
	): 'default' | 'info' | 'warning' | 'success' => {
		switch (status) {
			case 'draft':
				return 'default';
			case 'scheduled':
				return 'warning';
			case 'published':
				return 'success';
			default:
				return 'default';
		}
	};

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('dashboard')),
						href: FRONT_PATH_NAMES.tenant(tenantId).root,
					},
					{ name: _.capitalize(t('posts')) },
				]}
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.tenant(tenantId).posts.new}
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						{_.capitalize(t('create-post'))}
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Box
				sx={{
					gap: 3,
					display: 'flex',
					mb: { xs: 3, md: 5 },
					justifyContent: 'space-between',
					flexDirection: { xs: 'column', sm: 'row' },
					alignItems: { xs: 'flex-end', sm: 'center' },
				}}
			>
				<TextField
					placeholder={t('search-posts')}
					value={searchQuery}
					onChange={handleSearchChange}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<Iconify
										icon="eva:search-fill"
										sx={{ color: 'text.disabled' }}
									/>
								</InputAdornment>
							),
						},
					}}
					sx={{ width: { xs: 1, sm: 260 } }}
				/>
			</Box>

			<Tabs
				value={currentStatus}
				onChange={handleStatusChange}
				sx={{ mb: { xs: 3, md: 5 } }}
			>
				{POST_STATUS_OPTIONS.map((status) => (
					<Tab
						key={status}
						iconPosition="end"
						value={status}
						label={getStatusLabel(status)}
						icon={
							<Label
								variant={
									(status === 'all' || status === currentStatus) &&
									statusCounts[status] > 0
										? 'filled'
										: 'soft'
								}
								color={getStatusColor(status)}
							>
								{statusCounts[status]}
							</Label>
						}
						sx={{ textTransform: 'capitalize' }}
					/>
				))}
			</Tabs>

			<PostsEmptyContent tenantId={tenantId} />
		</DashboardContent>
	);
};

// ----------------------------------------------------------------------

type PostsEmptyContentProps = {
	tenantId?: string;
};

const PostsEmptyContent = ({ tenantId }: PostsEmptyContentProps) => {
	const { t } = useTranslate();

	return (
		<EmptyContent
			filled
			title={t('no-posts-yet')}
			description={t('no-posts-description')}
			sx={{
				py: 10,
				flexGrow: 1,
			}}
			action={
				<Button
					component={RouterLink}
					href={FRONT_PATH_NAMES.tenant(tenantId).posts.new}
					variant="contained"
					startIcon={<Iconify icon="mingcute:add-line" />}
					sx={{ mt: 2 }}
				>
					{_.capitalize(t('create-your-first-post'))}
				</Button>
			}
		/>
	);
};

export default PostsListPage;
