import { Container, Unstable_Grid2 as Grid } from '@mui/material';
import type { LoaderFunction } from '@remix-run/node';

import { ParsePost } from '@devist/shared/lib/parse/classes/post.class';

import _mock, { _blogCareerPosts, _categories, _tags } from '@/front/_mock';
import BlogSidebar from '@/front/containers/blog/sidebar/BlogSidebar';
import type { IPostWithRelations } from '@/shared/types/db/post.types';
import type { IUserWithRelations } from '@/shared/types/db/user.types';

import PostListHorizontal from '../containers/blog/PostListHorizontal';

// import { PostSearchMobile } from '../../blog/components';

export const loader = (async ({ params }) => {
	const { pageNum } = params;
	console.log('page', pageNum);

	const query = new Parse.Query(ParsePost).exists('translation.en' as never).include('author');
	const posts = (await query.find({
		useMasterKey: true,
		json: true,
	})) as unknown as (IPostWithRelations & {
		author: IUserWithRelations;
	})[];

	console.log(posts[0]);

	return {
		posts,
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
