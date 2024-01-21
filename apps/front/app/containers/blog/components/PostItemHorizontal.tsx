// @mui
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
// import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
// import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';

// import CustomPopover from '@devist/ui-react/components/CustomPopover';
// import usePopover from '@devist/ui-react/hooks/usePopover';
// import CustomPopover, { usePopover } from 'src/components/custom-popover';
// import Iconify from 'src/components/iconify';
// import Image from 'src/components/image';
// components
// import Label from 'src/components/label';
// import TextMaxLine from 'src/components/text-max-line';
// hooks
// import { useResponsive } from 'src/hooks/use-responsive';
// import { RouterLink } from 'src/routes/components';
// import { useRouter } from 'src/routes/hooks';
// routes
// import { paths } from 'src/routes/paths';
// types
import type { IPostItem } from '@devist/ui-react/types/blog';
import { fDate } from '@devist/ui-react/utils/date.utils';
import { fShortenNumber } from '@devist/ui-react/utils/number.utils';

import RouterLink from '@/front/components/RouterLink';
// import useRouter from '@/front/hooks/useRouter';
import { /* BO_PATH_NAMES, */ FRONT_PATH_NAMES } from '@/shared/lib/constants';
import Iconify from '@/ui-react/components/Iconify';
import ImageSSR from '@/ui-react/components/ImageSSR';
import Label from '@/ui-react/components/Label';
import TextMaxLine from '@/ui-react/components/TextMaxLine';
import useResponsive from '@/ui-react/hooks/useResponsive';

// ----------------------------------------------------------------------

type Props = {
	post: IPostItem;
};

const PostItemHorizontal = ({ post }: Props) => {
	// const popover = usePopover();

	// const router = useRouter();

	const mdUp = useResponsive('up', 'md');

	const { title, author, publish, coverUrl, createdAt, totalViews, totalShares, totalComments, description } = post;

	return (
		<>
			<Stack component={Card} direction="row">
				{mdUp && (
					<Box
						sx={{
							width: 200,
							height: 240,
							position: 'relative',
							flexShrink: 0,
							p: 1,
						}}
					>
						<Avatar
							alt={author.name}
							src={author.avatarUrl}
							sx={{ position: 'absolute', top: 16, left: 16, zIndex: 9 }}
						/>
						<ImageSSR alt={title} src={coverUrl} sx={{ height: 1, borderRadius: 1.5 }} />
					</Box>
				)}

				<Stack
					sx={{
						p: (theme) => {
							return theme.spacing(3, 3, 2, 3);
						},
					}}
				>
					<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
						<Label variant="soft" color={(publish === 'published' && 'info') || 'default'}>
							{publish}
						</Label>

						<Box component="span" sx={{ typography: 'caption', color: 'text.disabled' }}>
							{fDate(createdAt)}
						</Box>
					</Stack>

					<Stack spacing={1} flexGrow={1}>
						<Link color="inherit" component={RouterLink} href={FRONT_PATH_NAMES.posts.details(title)}>
							<TextMaxLine variant="subtitle2" line={2}>
								{title}
							</TextMaxLine>
						</Link>

						<TextMaxLine variant="body2" sx={{ color: 'text.secondary' }}>
							{description}
						</TextMaxLine>
					</Stack>

					<Stack direction="row" alignItems="center">
						{/* <IconButton color={popover.open ? 'inherit' : 'default'} onClick={popover.onOpen}>
							<Iconify icon="eva:more-horizontal-fill" />
						</IconButton> */}

						<Stack
							spacing={1.5}
							flexGrow={1}
							direction="row"
							justifyContent="flex-end"
							sx={{
								typography: 'caption',
								color: 'text.disabled',
							}}
						>
							<Stack direction="row" alignItems="center">
								<Iconify icon="eva:message-circle-fill" width={16} sx={{ mr: 0.5 }} />
								{fShortenNumber(totalComments)}
							</Stack>

							<Stack direction="row" alignItems="center">
								<Iconify icon="solar:eye-bold" width={16} sx={{ mr: 0.5 }} />
								{fShortenNumber(totalViews)}
							</Stack>

							<Stack direction="row" alignItems="center">
								<Iconify icon="solar:share-bold" width={16} sx={{ mr: 0.5 }} />
								{fShortenNumber(totalShares)}
							</Stack>
						</Stack>
					</Stack>
				</Stack>
			</Stack>

			{/* <CustomPopover open={popover.open} onClose={popover.onClose} arrow="bottom-center" sx={{ width: 140 }}>
				<MenuItem
					onClick={() => {
						popover.onClose();
						router.push(FRONT_PATH_NAMES.posts.details(title));
					}}
				>
					<Iconify icon="solar:eye-bold" />
					View
				</MenuItem>

				<MenuItem
					onClick={() => {
						popover.onClose();
						router.push(BO_PATH_NAMES.dashboard.posts.edit(title));
					}}
				>
					<Iconify icon="solar:pen-bold" />
					Edit
				</MenuItem>

				<MenuItem
					onClick={() => {
						popover.onClose();
					}}
					sx={{ color: 'error.main' }}
				>
					<Iconify icon="solar:trash-bin-trash-bold" />
					Delete
				</MenuItem>
			</CustomPopover> */}
		</>
	);
};

export default PostItemHorizontal;
