import { type LazyExoticComponent, lazy, Suspense } from 'react';
import { useParams } from 'react-router';

import { APP_NAME } from '@org/shared-ts/lib/constants';

import { BLOG_POSTS, unsplashCover } from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

// Static slug → lazy article-component map. Lazy keeps each article's body
// bundle out of the index page payload AND each other's payload — only the
// requested slug's body downloads on navigation.
const ARTICLE_COMPONENTS: Record<
	string,
	LazyExoticComponent<() => React.ReactNode>
> = {
	'multi-tenant-architecture-lessons': lazy(() => {
		return import('./_articles/multi-tenant-architecture-lessons-article.tsx');
	}),
	'shipping-daily-without-burning-out': lazy(() => {
		return import('./_articles/shipping-daily-without-burning-out-article.tsx');
	}),
	'why-we-rewrote-our-scheduler': lazy(() => {
		return import('./_articles/why-we-rewrote-our-scheduler-article.tsx');
	}),
	'turning-trial-users-into-paying-customers': lazy(() => {
		return import('./_articles/turning-trial-users-into-paying-customers-article.tsx');
	}),
};

// ----------------------------------------------------------------------

const BlogArticleRoute = () => {
	const { slug } = useParams<{ slug: string }>();

	if (!slug) {
		throw new Response('Not Found', { status: 404 });
	}

	const post = BLOG_POSTS.find((p) => {
		return p.slug === slug;
	});

	if (!post) {
		throw new Response('Not Found', { status: 404 });
	}

	const ArticleComponent = ARTICLE_COMPONENTS[slug];

	if (!ArticleComponent) {
		// Slug exists in BLOG_POSTS but no matching component — defensive,
		// shouldn't happen in healthy code. The error message tells you which
		// slug is missing a body file.
		throw new Response(
			`Blog article component for slug "${slug}" not found in ARTICLE_COMPONENTS map`,
			{ status: 404 },
		);
	}

	return (
		<Suspense fallback={null}>
			<ArticleComponent />
		</Suspense>
	);
};

export default BlogArticleRoute;

// ----------------------------------------------------------------------

// Per-article SEO meta, derived from BLOG_POSTS. React Router calls this
// with the same params as the route, so we look up the post by slug here too.
type MetaArgs = { params: { slug?: string } };

export const meta = ({ params }: MetaArgs) => {
	const post = BLOG_POSTS.find((p) => {
		return p.slug === params.slug;
	});

	if (!post) {
		return [{ title: `Not Found | ${APP_NAME}` }];
	}

	const ogImage = unsplashCover(post.coverSlug, { w: 1200, h: 630 });

	return [
		{ title: `${post.title} | ${APP_NAME}` },
		{ name: 'description', content: post.excerpt },
		{ property: 'og:title', content: post.title },
		{ property: 'og:description', content: post.excerpt },
		{ property: 'og:image', content: ogImage },
		{ property: 'og:type', content: 'article' },
	];
};
