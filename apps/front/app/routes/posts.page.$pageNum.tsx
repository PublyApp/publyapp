import { Container, Unstable_Grid2 as Grid } from '@mui/material';
// import { type LoaderFunction } from '@remix-run/node';
import { /* useLoaderData, */ defer, type ClientLoaderFunction } from '@remix-run/react';
import { useTranslation } from 'react-i18next';

// import { t } from 'i18next';

import { _categories, _tags } from '@/front/_mock';
import PostListHorizontal from '@/front/containers/postList/PostListHorizontal';
import BlogSidebar from '@/front/containers/postList/sidebar/BlogSidebar';
import parseApi from '@/ui-react/api/parse/ParseApi';

import { safelyRunInLoader } from '../lib/remix/safelyRun';

// export const loader = (async ({ params }) => {
// 	const pageNum = Number(params.pageNum);

// 	const posts = await safelyRunInLoader(parseApi.posts.findPost)({ page: pageNum });

// 	return {
// 		posts,
// 	};
// }) satisfies LoaderFunction;

export const clientLoader = (async ({ /* serverLoader, */ params }) => {
	const tags = safelyRunInLoader(parseApi.posts.findPostTag)();
	// const { posts } = await serverLoader<Awaited<ReturnType<typeof loader>>>();
	const posts = safelyRunInLoader(parseApi.posts.findPostFrontList)({ page: Number(params.pageNum) });

	return defer({
		posts,
		tags,
	});
}) satisfies ClientLoaderFunction;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// (clientLoader as any).hydrate = true;

export type PostListLoaderFunction = typeof clientLoader;

const PostsPage = () => {
	// const data = useLoaderData<PostListLoaderFunction>();
	const { t } = useTranslation();

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
						{/* <LanguageSwitcher /> */}
						<h1>{t('hello')}</h1>
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
