import { Avatar, Box, Card, Link, Stack, useTheme } from '@mui/material';
import { nanoid } from 'nanoid';

// import CustomPopover from '@devist/ui-react/components/CustomPopover';
// import usePopover from '@devist/ui-react/hooks/usePopover';
// import CustomPopover, { usePopover } from 'src/components/custom-popover';
// import Iconify from 'src/components/iconify';
// import Image from 'src/components/image/Image';
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
// import type { IPostItem } from '@devist/ui-react/types/blog';
// import { nanoid } from 'nanoid';

import type { TranslatedIPostWithRelations } from '@devist/shared/types/db/post.types';
import { getUserFullName } from '@devist/shared/utils/user.utils';
import { fDate } from '@devist/ui-react/utils/date.utils';
import { fShortenNumber } from '@devist/ui-react/utils/number.utils';

import RouterLink from '@/front/components/RouterLink';
// import useRouter from '@/front/hooks/useRouter';
import { /* BO_PATH_NAMES, */ FRONT_PATH_NAMES } from '@/shared/lib/constants';
// import type { IUserWithRelations } from '@/shared/types/db/user.types';
import Iconify from '@/ui-react/components/Iconify';
import Image from '@/ui-react/components/image/Image';
// import NcImage from '@/ui-react/components/image/NcImage';
import Label from '@/ui-react/components/Label';
import TextMaxLine from '@/ui-react/components/TextMaxLine';
import { pxToRem } from '@/ui-react/utils/css.utils';

// import useResponsive from '@/ui-react/hooks/useResponsive';

// ----------------------------------------------------------------------

// type IPostItem = IPostWithRelations & {
// 	author: IUserWithRelations;
// 	commentsCount?: number;
// };
type IPostItem = TranslatedIPostWithRelations;

type Props = {
	// post: IPostItem;
	post: IPostItem;
};

const PostItemHorizontal = ({ post }: Props) => {
	// const popover = usePopover();

	// const router = useRouter();

	// const mdUp = useResponsive('up', 'md');

	const { author, cover } = post;
	// const { author, slug, translation, cover, viewCount, published, publishDate, createdAt, tags } = post;
	// const { title, author, publish, coverUrl, createdAt, totalViews, totalShares, totalComments, description } = post;

	const theme = useTheme();

	return (
		<>
			<Stack component={Card} direction="row">
				{/* eslint-disable-next-line no-nested-ternary */}
				<Box
					sx={{
						width: 200,
						height: 240,
						position: 'relative',
						flexShrink: 0,
						p: 1,

						[theme.breakpoints.down('md')]: {
							display: 'none',
						},
					}}
				>
					<Avatar
						alt={getUserFullName(author)}
						// src={author.avatarUrl}
						src={author.avatarUrl}
						sx={{ position: 'absolute', top: 16, left: 16, zIndex: 9 }}
					/>
					<Image alt={cover?.alternativeText || post.title} src={cover?.url} sx={{ height: 1, borderRadius: 1.5 }} />
				</Box>

				<Stack
					sx={{
						// eslint-disable-next-line @typescript-eslint/no-shadow
						p: (theme) => {
							return theme.spacing(3, 3, 2, 3);
						},

						flexGrow: 1,
					}}
				>
					<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
						{/* <Label variant="soft" color={post.published ? 'info' : 'default'}>
							{post.published ? 'Published' : 'Draft'}
						</Label> */}
						<Box />

						<Box component="span" sx={{ typography: 'caption', color: 'text.disabled' }}>
							{fDate(post.publishDate || post.createdAt)}
						</Box>
					</Stack>

					<Stack spacing={1} flexGrow={1}>
						<Link
							color="inherit"
							component={RouterLink}
							href={FRONT_PATH_NAMES.posts.details(post.slug)}
							sx={{ width: 'fit-content' }}
						>
							<TextMaxLine variant="h4" line={2} sx={{ width: 'fit-content' }}>
								{post.title}
							</TextMaxLine>
						</Link>

						<TextMaxLine variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
							{post.description}
						</TextMaxLine>

						<Stack direction="row" /* maxWidth="80%" */ flexWrap="wrap" gap={1}>
							{post.tags?.map((tag) => {
								return (
									<Label key={nanoid()} variant="soft" color="default" alignItems="center">
										<Box
											maxWidth={pxToRem(100)}
											height="100%"
											textOverflow="ellipsis"
											whiteSpace="nowrap"
											overflow="hidden"
											lineHeight={2}
										>
											{`#${tag}`}
										</Box>
									</Label>
								);
							})}
						</Stack>
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
								{fShortenNumber(post.commentCount || 0)}
							</Stack>

							<Stack direction="row" alignItems="center">
								<Iconify icon="solar:eye-bold" width={16} sx={{ mr: 0.5 }} />
								{fShortenNumber(post.viewCount)}
							</Stack>

							{/* <Stack direction="row" alignItems="center">
								<Iconify icon="solar:share-bold" width={16} sx={{ mr: 0.5 }} />
								{fShortenNumber(totalShares)}
							</Stack> */}
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
