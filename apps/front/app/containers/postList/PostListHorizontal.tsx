import { Suspense } from 'react';

import { Box, Pagination, paginationClasses, Typography } from '@mui/material';
import { Await, useLoaderData } from '@remix-run/react';
import _ from 'lodash';
import { nanoid } from 'nanoid';

// import type { IPostItem } from '@/ui-react/types/blog';

import { _blogCareerPosts } from '@/front/_mock';
import Retry from '@/front/components/Retry';
import useTranslate from '@/front/hooks/useTranslate';
import { isErrorJSON } from '@/front/lib/remix/safelyRun';
import type { PostListLoaderFunction } from '@/front/routes/posts.page.$pageNum';

import PostItemHorizontal from '../../components/PostItemHorizontal';
import PostItemSkeleton from '../../components/PostItemSkeleton';

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
	// const loading = false;
	const { posts } = useLoaderData<PostListLoaderFunction>();
	// const { state } = useNavigation();
	const { t } = useTranslate();

	// if (_.isArray(posts)) {
	// 	posts[0]
	// }

	const renderSkeleton = (
		<>
			{[...Array(16)].map((_void) => {
				return <PostItemSkeleton key={nanoid()} variant="horizontal" />;
			})}
		</>
	);

	const renderList = (
		<Suspense fallback={renderSkeleton}>
			<Await resolve={posts}>
				{/* eslint-disable-next-line @typescript-eslint/no-shadow */}
				{(posts) => {
					if (isErrorJSON(posts)) {
						return <Retry message={t('an-error-occurred')} />;
					}

					return !_.isError(posts) ? (
						posts.map((post) => {
							return <PostItemHorizontal key={post.objectId} post={post} />;
						})
					) : (
						<Typography sx={{ color: 'red' }}>An Error occurred: {posts.message}</Typography>
					);
				}}
				{/* {posts && _.isArray(posts)
				? posts.map((post) => {
					return <PostItemHorizontal key={post.objectId} post={post} />;
				})
				: null} */}
			</Await>
		</Suspense>
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
				{/* {state === 'loading' ? renderSkeleton : renderList} */}
				{renderList}
			</Box>

			{posts && _.isArray(posts) && (posts || []).length > 8 && (
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
