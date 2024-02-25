import { Box, Pagination, paginationClasses } from '@mui/material';
import { useLoaderData } from '@remix-run/react';
import { nanoid } from 'nanoid';

// import type { IPostItem } from '@devist/ui-react/types/blog';

import { _blogCareerPosts } from '@/front/_mock';
import type { PostListLoaderFunction } from '@/front/routes/posts.page.$pageNum';

import PostItemHorizontal from './components/PostItemHorizontal';
import { PostItemSkeleton } from './components/PostItemSkeleton';

// const posts = _blogCareerPosts.map((post) => {
// 	return {
// 		...post,
// 		coverUrl: post.coverImg.replace('https://devist.dev', ''),
// 	};
// });

// ----------------------------------------------------------------------
// Fill the array below with 16 items

// type Props = {
// 	posts: IPostItem[];
// 	loading?: boolean;
// };

const PostListHorizontal = (/* { posts, loading }: Props */) => {
	// const loading = useFakeLoading();
	const loading = false;
	const { posts } = useLoaderData<PostListLoaderFunction>();

	const renderSkeleton = (
		<>
			{[...Array(16)].map((_) => {
				return <PostItemSkeleton key={nanoid()} variant="horizontal" />;
			})}
		</>
	);

	const renderList = (
		<>
			AAAAAAAAAAA
			{/* {posts
				? posts.map((post) => {
						return <PostItemHorizontal key={post.objectId} post={post as never} />;
					})
				: null} */}
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

			{(posts || []).length > 8 && (
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
