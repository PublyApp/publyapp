import { Button, Grid, Stack } from '@mui/material';
import { nanoid } from 'nanoid';

import Iconify from '@devist/ui-react/components/Iconify';

import PostItem from '@/front/components/PostItem';
import PostItemSkeleton from '@/front/components/PostItemSkeleton';

// import { IPostItem } from 'src/types/blog';
// import PostItem from './post-item';
// import { PostItemSkeleton } from './post-skeleton';

// ----------------------------------------------------------------------

type Props = {
	posts: IPostItem[];
	loading?: boolean;
	disabledIndex?: boolean;
};

const MorePostList = ({ posts, loading, disabledIndex }: Props) => {
	const renderSkeleton = (
		<>
			{[...Array(16)].map((_) => {
				return (
					<Grid key={nanoid()} xs={12} sm={6} md={3}>
						<PostItemSkeleton />
					</Grid>
				);
			})}
		</>
	);

	const renderList = (
		<>
			{posts.map((post, index) => {
				return (
					<Grid key={post.id} xs={12} sm={6} md={!disabledIndex && index === 0 ? 6 : 3}>
						<PostItem post={post} index={!disabledIndex ? index : undefined} />
					</Grid>
				);
			})}
		</>
	);

	return (
		<>
			<Grid container spacing={3}>
				{loading ? renderSkeleton : renderList}
			</Grid>

			{posts.length > 8 && (
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
			)}
		</>
	);
};

export default MorePostList;
