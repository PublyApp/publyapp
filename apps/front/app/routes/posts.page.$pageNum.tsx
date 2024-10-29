import { Container, Grid2 as Grid } from '@mui/material';
import type { MetaFunction } from '@remix-run/node';
// import { type LoaderFunction } from '@remix-run/node';
import { /* useLoaderData, */ defer, type ClientLoaderFunction } from '@remix-run/react';

import parseApi from '@devist/api/parse/ParseApi';

import { _categories, _tags } from '@/front/_mock';
import PostListHorizontal from '@/front/containers/postList/PostListHorizontal';
import BlogSidebar from '@/front/containers/postList/sidebar/BlogSidebar';
// import { getT } from '@/server/lib/i18n';
import { defaultLocale } from '@/shared/lib/i18n/resources';

import { returnLanguageIfSupported } from '../lib/i18n/i18n';
import { safelyRunInLoader } from '../lib/remix/safelyRun';

// export const loader = (async ({ params }) => {
// 	const pageNum = Number(params.pageNum);

// 	const posts = await safelyRunInLoader(parseApi.blog.findPost)({ page: pageNum });

// 	return {
// 		posts,
// 	};
// }) satisfies LoaderFunction;
export const meta: MetaFunction = ({ params }) => {
	const lang = returnLanguageIfSupported(params.lang);
	const locale = lang ?? defaultLocale;

	const t = getFixedT(locale);

	return [
		{ title: t('blog-list-meta-title') },
		{
			property: 'og:title',
			content: t('blog-list-og-title'),
		},
		{
			name: 'description',
			content: t('blog-list-meta-description'),
		},
	];
};

export const clientLoader = (async ({ /* serverLoader, */ params }) => {
	// const tags = safelyRunInLoader(parseApi.blog.findBlogPostTag)();
	// const { posts } = await serverLoader<Awaited<ReturnType<typeof loader>>>();
	const posts = safelyRunInLoader(parseApi.blog.findBlogPostFrontList)({ page: Number(params.pageNum) });

	return defer({
		posts,
		// tags,
	});
}) satisfies ClientLoaderFunction;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// (clientLoader as any).hydrate = true;

export type PostListLoaderFunction = typeof clientLoader;

const PostsPage = () => {
	// const data = useLoaderData<PostListLoaderFunction>();
	// const { t } = useTranslation();

	return (
		<>
			{/* <PostSearchMobile /> */}

			<Container
				sx={{
					pt: { xs: 0, md: 5 },
					pb: { xs: 8, md: 15 },
				}}
			>
				<Grid container spacing={{ md: 8 }} justifyContent="center">
					<Grid xs={12} /* md={8} */ md={10}>
						{/* <LanguageSwitcher /> */}
						{/* <h1>{t('hello')} aaa</h1> */}
						<PostListHorizontal />
					</Grid>

					<Grid xs={12} md={4} display="none">
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
