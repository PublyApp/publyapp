import { alpha, Avatar, Box, Card, CardContent, Link, Typography, useTheme } from '@mui/material';
import _ from 'lodash';

// import Iconify from '@devist/ui-react/components/Iconify';

import Image from '@devist/ui-react/components/image/Image';
import TextMaxLine from '@devist/ui-react/components/TextMaxLine';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { type TranslatedIBlogPostWithRelations } from '@/shared/types/db/blogPost.types';
import { getUserFullName } from '@/shared/utils/user.utils';
import useResponsive from '@/ui-react/hooks/useResponsive';
import { fDate } from '@/ui-react/utils/date.utils';

// import { fShortenNumber } from '@/ui-react/utils/number.utils';

import AvatarShape from './AvatarShape';
import RouterLink from './RouterLink';

// import { paths } from 'src/routes/paths';
// import { useResponsive } from 'src/hooks/use-responsive';
// import { fDate } from 'src/utils/format-time';
// import { fShortenNumber } from 'src/utils/format-number';
// import { AvatarShape } from 'src/assets/illustrations';
// import { IPostItem } from 'src/types/blog';

// ----------------------------------------------------------------------

type Props = {
	post: TranslatedIBlogPostWithRelations;
	index?: number;
};

const PostItem = ({ post, index }: Props) => {
	const theme = useTheme();

	const mdUp = useResponsive('up', 'md');

	const {
		/* coverUrl, */
		title,
		currentSlug,
		/* title, totalViews, totalComments, totalShares, */
		author,
		createdAt,
		cover,
	} = post;

	const latestPost = index === 0 || index === 1 || index === 2;

	if (mdUp && latestPost) {
		return (
			<Card>
				<Avatar
					alt={getUserFullName(author)}
					src={author.avatarUrl}
					sx={{
						top: 24,
						left: 24,
						zIndex: 9,
						position: 'absolute',
					}}
				/>

				{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
				<PostContent
					title={title}
					slug={_.toString(currentSlug) || 'no-slug'}
					createdAt={fDate(createdAt)}
					// totalViews={totalViews}
					// totalShares={totalShares}
					// totalComments={totalComments}
					index={index}
				/>

				<Image
					alt={title}
					src={cover?.url}
					overlay={alpha(theme.palette.grey[900], 0.48)}
					sx={{
						width: 1,
						height: 360,
					}}
				/>
			</Card>
		);
	}

	return (
		<Card>
			<Box sx={{ position: 'relative' }}>
				<AvatarShape
					sx={{
						left: 0,
						zIndex: 9,
						width: 88,
						height: 36,
						bottom: -16,
						position: 'absolute',
					}}
				/>

				<Avatar
					alt={getUserFullName(author)}
					src={author.avatarUrl}
					sx={{
						left: 24,
						zIndex: 9,
						bottom: -24,
						position: 'absolute',
					}}
				/>

				<Image alt={title} src={cover?.url} ratio="4/3" />
			</Box>

			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
			<PostContent
				title={title}
				slug={_.toString(currentSlug) || 'no-slug'}
				// totalViews={totalViews}
				// totalComments={totalComments}
				// totalShares={totalShares}
				createdAt={fDate(createdAt)}
			/>
		</Card>
	);
};

export default PostItem;

// ----------------------------------------------------------------------

type PostContentProps = {
	title: string;
	slug: string;
	index?: number;
	totalViews?: number;
	totalShares?: number;
	totalComments?: number;
	createdAt: Date | string | number;
};

export const PostContent = ({
	title,
	slug,
	createdAt,
	totalViews: _1,
	totalShares: _2,
	totalComments: _3,
	index,
}: PostContentProps) => {
	const mdUp = useResponsive('up', 'md');

	const linkTo = FRONT_PATH_NAMES.posts.details(slug);

	const latestPostLarge = index === 0;

	const latestPostSmall = index === 1 || index === 2;

	return (
		<CardContent
			sx={{
				pt: 6,
				width: 1,
				...((latestPostLarge || latestPostSmall) && {
					pt: 0,
					zIndex: 9,
					bottom: 0,
					position: 'absolute',
					color: 'common.white',
				}),
			}}
		>
			<Typography
				variant="caption"
				component="div"
				sx={{
					mb: 1,
					color: 'text.disabled',
					...((latestPostLarge || latestPostSmall) && {
						opacity: 0.64,
						color: 'common.white',
					}),
				}}
			>
				{fDate(createdAt)}
			</Typography>

			<Link color="inherit" component={RouterLink} href={linkTo}>
				<TextMaxLine variant={mdUp && latestPostLarge ? 'h5' : 'subtitle2'} line={2} persistent>
					{title}
				</TextMaxLine>
			</Link>

			{/* <Stack
				spacing={1.5}
				direction="row"
				justifyContent="flex-end"
				sx={{
					mt: 3,
					typography: 'caption',
					color: 'text.disabled',
					...((latestPostLarge || latestPostSmall) && {
						opacity: 0.64,
						color: 'common.white',
					}),
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
			</Stack> */}
		</CardContent>
	);
};
