import { Box, Pagination, paginationClasses } from '@mui/material';
import { nanoid } from 'nanoid';

import { _blogCareerPosts } from '@/front/_mock';
import useFakeLoading from '@/ui-react/hooks/useFakeLoading';

// import type { IPostItem } from '@devist/ui-react/types/blog';

import PostItemHorizontal from './components/PostItemHorizontal';
import { PostItemSkeleton } from './components/PostItemSkeleton';

const posts = _blogCareerPosts.map((post) => {
	return {
		...post,
		coverUrl: post.coverImg.replace('https://devist.dev', ''),
	};
});

// ----------------------------------------------------------------------
// Fill the array below with 16 items

// type Props = {
// 	posts: IPostItem[];
// 	loading?: boolean;
// };

const PostListHorizontal = (/* { posts, loading }: Props */) => {
	const loading = useFakeLoading();

	const renderSkeleton = (
		<>
			{[...Array(16)].map((_) => {
				return <PostItemSkeleton key={nanoid()} variant="horizontal" />;
			})}
		</>
	);

	const renderList = (
		<>
			{posts.map((post) => {
				return <PostItemHorizontal key={post.id} post={post} />;
			})}
		</>
	);

	return (
		<>
			<Box
				gap={3}
				display="grid"
				gridTemplateColumns={{
					xs: 'repeat(1, 1fr)',
					// md: 'repeat(2, 1fr)',
				}}
			>
				{loading ? renderSkeleton : renderList}
			</Box>

			{posts.length > 8 && (
				<Pagination
					count={8}
					sx={{
						mt: 8,
						[`& .${paginationClasses.ul}`]: {
							justifyContent: 'center',
						},
					}}
				/>
			)}
		</>
	);
};

export default PostListHorizontal;
