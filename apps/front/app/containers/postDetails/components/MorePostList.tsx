import { /* Button, */ Box, Unstable_Grid2 as Grid /* Stack */, Typography } from '@mui/material';
// import Grid from '@mui/material/Unstable_Grid2';
import { nanoid } from 'nanoid';

// import Iconify from '@devist/ui-react/components/Iconify';

import PostItem from '@/front/components/PostItem';
import useTranslate from '@/front/hooks/useTranslate';
import { type TranslatedIBlogPostWithRelations } from '@/shared/types/db/blogPost.types';

// import PostItemSkeleton from '@/front/components/PostItemSkeleton';

// import { IPostItem } from 'src/types/blog';
// import PostItem from './post-item';
// import { PostItemSkeleton } from './post-skeleton';

// ----------------------------------------------------------------------

type Props = {
	posts: TranslatedIBlogPostWithRelations[];
	// loading?: boolean;
	disabledIndex?: boolean;
};

const MorePostList = ({ posts, /* loading, */ disabledIndex = true }: Props) => {
	const { t } = useTranslate();
	// const renderSkeleton = (
	// 	<>
	// 		{[...Array(16)].map((_) => {
	// 			return (
	// 				<Grid key={nanoid()} xs={12} sm={6} md={3}>
	// 					<PostItemSkeleton />
	// 				</Grid>
	// 			);
	// 		})}
	// 	</>
	// );

	const renderList = (
		<>
			{posts.map((post, index) => {
				return (
					<Grid key={nanoid()} /* key={post.id} */ xs={12} sm={6} md={!disabledIndex && index === 0 ? 6 : 3}>
						<PostItem post={post} index={!disabledIndex ? index : undefined} />
					</Grid>
				);
			})}
		</>
	);

	return (
		<Box>
			<Typography variant="h3" mb={3}>
				{t('other-posts')}
			</Typography>
			<Grid container spacing={3} /* justifyContent="center" */>
				{/* {loading ? renderSkeleton : renderList} */}
				{renderList}
			</Grid>

			{/* {posts.length > 8 && (
				<Stack
					alignItems="center"
					sx={{
						mt: 8,
						mb: { xs: 10, md: 15 },
					}}
				>
					<Button
						size="large"
						variant="outlined"
						startIcon={<Iconify icon="svg-spinners:12-dots-scale-rotate" width={24} />}
					>
						Load More
					</Button>
				</Stack>
			)} */}
		</Box>
	);
};

export default MorePostList;
