import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import i18next, { type TFunction } from 'i18next';
import _ from 'lodash';
import { useState } from 'react';
import { data, useParams } from 'react-router';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { EmptyContent } from '@/front/components/empty-content/empty-content';
import { Iconify } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { getServerLoader } from '@/front/lib/react-router/server-data.server';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/media-library-page';

// ----------------------------------------------------------------------

type MediaTypeFilter = 'all' | 'images' | 'videos';

// Mock media item type - to be replaced with actual API types later
type MediaItem = {
	id: string;
	filename: string;
	url: string;
	thumbnailUrl: string;
	type: 'image' | 'video';
	size: number;
	uploadedAt: string;
};

// ----------------------------------------------------------------------

const getPageTitle = (_t: TFunction, seo?: boolean) => {
	let str = 'Media Library';

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

const MediaLibraryPage = () => {
	const { t } = useTranslate();
	const { tenantId } = useParams<{ tenantId: string }>();

	const [searchQuery, setSearchQuery] = useState('');
	const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');

	// Empty data for now - no API integration yet
	const mediaItems: MediaItem[] = [];

	const filteredItems = mediaItems.filter((item) => {
		const matchesSearch = item.filename
			.toLowerCase()
			.includes(searchQuery.toLowerCase());
		const matchesType =
			typeFilter === 'all' ||
			(typeFilter === 'images' && item.type === 'image') ||
			(typeFilter === 'videos' && item.type === 'video');
		return matchesSearch && matchesType;
	});

	const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(event.target.value);
	};

	const handleTypeFilterChange = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		setTypeFilter(event.target.value as MediaTypeFilter);
	};

	const handleUploadClick = () => {
		// TODO: Open upload dialog
	};

	const renderFilters = () => (
		<Stack
			spacing={2}
			direction={{ xs: 'column', sm: 'row' }}
			alignItems={{ xs: 'stretch', sm: 'center' }}
			sx={{ mb: 3 }}
		>
			<TextField
				size="small"
				placeholder="Search by filename..."
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
				sx={{ minWidth: 240 }}
			/>

			<TextField
				select
				size="small"
				value={typeFilter}
				onChange={handleTypeFilterChange}
				sx={{ minWidth: 140 }}
			>
				<MenuItem value="all">All Types</MenuItem>
				<MenuItem value="images">Images</MenuItem>
				<MenuItem value="videos">Videos</MenuItem>
			</TextField>
		</Stack>
	);

	const renderMediaGrid = () => {
		if (filteredItems.length === 0) {
			return (
				<EmptyContent
					title="No media files"
					description="Upload images or videos to get started"
					sx={{ py: 10 }}
					filled
					action={
						<Button
							variant="contained"
							startIcon={<Iconify icon="eva:cloud-upload-fill" />}
							onClick={handleUploadClick}
							sx={{ mt: 3 }}
						>
							Upload Media
						</Button>
					}
				/>
			);
		}

		return (
			<Box
				sx={{
					gap: 3,
					display: 'grid',
					gridTemplateColumns: {
						xs: 'repeat(1, 1fr)',
						sm: 'repeat(2, 1fr)',
						md: 'repeat(3, 1fr)',
						lg: 'repeat(4, 1fr)',
					},
				}}
			>
				{filteredItems.map((item) => (
					<MediaItemCard
						key={item.id}
						item={item}
						onView={() => {
							// TODO: Open view dialog
						}}
						onDelete={() => {
							// TODO: Open delete confirmation
						}}
						onCopyUrl={() => {
							// TODO: Copy URL to clipboard
						}}
					/>
				))}
			</Box>
		);
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
					{ name: 'Media Library' },
				]}
				action={
					<Button
						variant="contained"
						startIcon={<Iconify icon="eva:cloud-upload-fill" />}
						onClick={handleUploadClick}
					>
						Upload
					</Button>
				}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Card sx={{ flexGrow: 1, p: 3 }}>
				{renderFilters()}
				<Divider sx={{ mb: 3 }} />
				{renderMediaGrid()}
			</Card>
		</DashboardContent>
	);
};

export default MediaLibraryPage;

// ----------------------------------------------------------------------

type MediaItemCardProps = {
	item: MediaItem;
	onView: () => void;
	onDelete: () => void;
	onCopyUrl: () => void;
};

const MediaItemCard = ({
	item,
	onView,
	onDelete,
	onCopyUrl,
}: MediaItemCardProps) => {
	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
	};

	const formatDate = (dateString: string): string => {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	return (
		<Paper
			variant="outlined"
			sx={{
				p: 2,
				display: 'flex',
				borderRadius: 2,
				cursor: 'pointer',
				position: 'relative',
				bgcolor: 'transparent',
				flexDirection: 'column',
				'&:hover': {
					bgcolor: 'background.paper',
					boxShadow: (theme) => theme.shadows[8],
				},
			}}
		>
			{/* Thumbnail */}
			<Box
				sx={{
					width: '100%',
					height: 160,
					borderRadius: 1.5,
					overflow: 'hidden',
					bgcolor: 'grey.100',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					mb: 2,
				}}
			>
				{item.thumbnailUrl ? (
					<Box
						component="img"
						src={item.thumbnailUrl}
						alt={item.filename}
						sx={{
							width: '100%',
							height: '100%',
							objectFit: 'cover',
						}}
					/>
				) : (
					<Iconify
						icon={
							item.type === 'video'
								? 'solar:videocamera-record-bold'
								: 'solar:gallery-wide-bold'
						}
						width={48}
						sx={{ color: 'grey.500' }}
					/>
				)}

				{item.type === 'video' && item.thumbnailUrl && (
					<Box
						sx={{
							position: 'absolute',
							top: 16,
							left: 16,
							width: 32,
							height: 32,
							borderRadius: '50%',
							bgcolor: 'rgba(0, 0, 0, 0.6)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<Iconify icon="solar:play-circle-bold" sx={{ color: 'white' }} />
					</Box>
				)}
			</Box>

			{/* File info */}
			<Typography
				variant="subtitle2"
				noWrap
				sx={{ mb: 0.5 }}
				title={item.filename}
			>
				{item.filename}
			</Typography>

			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					typography: 'caption',
					color: 'text.disabled',
				}}
			>
				{formatFileSize(item.size)}
				<Box
					component="span"
					sx={{
						mx: 0.75,
						width: 2,
						height: 2,
						borderRadius: '50%',
						bgcolor: 'currentColor',
					}}
				/>
				{formatDate(item.uploadedAt)}
			</Box>

			{/* Actions */}
			<Box
				sx={{
					position: 'absolute',
					top: 8,
					right: 8,
					display: 'flex',
					gap: 0.5,
				}}
			>
				<Tooltip title="View" placement="top" arrow>
					<IconButton size="small" onClick={onView}>
						<Iconify icon="solar:eye-bold" width={18} />
					</IconButton>
				</Tooltip>

				<Tooltip title="Copy URL" placement="top" arrow>
					<IconButton size="small" onClick={onCopyUrl}>
						<Iconify icon="eva:link-2-fill" width={18} />
					</IconButton>
				</Tooltip>

				<Tooltip title="Delete" placement="top" arrow>
					<IconButton
						size="small"
						onClick={onDelete}
						sx={{ color: 'error.main' }}
					>
						<Iconify icon="solar:trash-bin-trash-bold" width={18} />
					</IconButton>
				</Tooltip>
			</Box>
		</Paper>
	);
};
