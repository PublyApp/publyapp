import { Container, Unstable_Grid2 as Grid } from '@mui/material';
import { type LoaderFunction } from '@remix-run/node';

import { _categories, _tags } from '@/front/_mock';
import BlogSidebar from '@/front/containers/blog/sidebar/BlogSidebar';

import PostListHorizontal from '../containers/blog/PostListHorizontal';
import { findPost } from '../lib/parse/request/post.request';
import { safelyRunInLoader } from '../lib/remix/safelyRun';

export const loader = (async ({ params }) => {
	const pageNum = Number(params.pageNum);

	const posts = await safelyRunInLoader(findPost)({ page: pageNum });

	return {
		posts,
		// aaaa: new Error('aaaa'),
	};
}) satisfies LoaderFunction;

export type PostListLoaderFunction = typeof loader;

const PostsPage = () => {
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
