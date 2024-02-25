import { Container, Unstable_Grid2 as Grid } from '@mui/material';
import { type LoaderFunction } from '@remix-run/node';
import { useLoaderData, type ClientLoaderFunction } from '@remix-run/react';

import { _categories, _tags } from '@/front/_mock';
import BlogSidebar from '@/front/containers/blog/sidebar/BlogSidebar';

import { parseApi } from '../api/_index';
import PostListHorizontal from '../containers/blog/PostListHorizontal';
import { safelyRunInLoader } from '../lib/remix/safelyRun';

export const loader = (async ({ params }) => {
	const pageNum = Number(params.pageNum);

	const posts = await safelyRunInLoader(parseApi.posts.findPost)({ page: pageNum });

	return {
		posts,
	};
}) satisfies LoaderFunction;

export const clientLoader = (async ({ serverLoader }) => {
	const tags = await safelyRunInLoader(parseApi.posts.findPostTag)();
	const { posts } = await serverLoader<Awaited<ReturnType<typeof loader>>>();

	console.log('tags xxxxxxxxxxxxxxxxx', tags);

	return {
		posts,
		tags,
	};
}) satisfies ClientLoaderFunction;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(clientLoader as any).hydrate = true;

export type PostListLoaderFunction = typeof clientLoader;

const PostsPage = () => {
	const data = useLoaderData<PostListLoaderFunction>();

	console.log('data -----------------------', data);

	const { tags } = data;

	console.log('😅😅😅😅', tags);

	return (
		<>
			{/* <PostSearchMobile /> */}

			<Container
				sx={{
					pt: { xs: 0, md: 5 },
					pb: { xs: 8, md: 15 },
				}}
			>
				<Grid container spacing={{ md: 8 }}>
					<Grid xs={12} md={8}>
						<PostListHorizontal />
					</Grid>

					<Grid xs={12} md={4}>
						<BlogSidebar
							popularTags={_tags}
							categories={_categories}
							// recentPosts={{ list: _blogCareerPosts.slice(-4) }}
							// advertisement={{
							// 	title: 'Advertisement',
							// 	description: 'Duis leo. Donec orci lectus, aliquam ut, faucibus non',
							// 	imageUrl: _mock.image.career(10),
							// 	path: '',
							// }}
						/>
					</Grid>
				</Grid>
			</Container>
		</>
	);
};

export default PostsPage;
