import { useParams } from 'react-router';

import { APP_NAME } from '@org/shared-ts/lib/constants';

import {
	getPublishedPosts,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

import BlogElementsReferenceArticle from './_articles/blog-elements-reference-article.tsx';
import MultiTenantArchitectureLessonsArticle from './_articles/multi-tenant-architecture-lessons-article.tsx';
import ShippingDailyWithoutBurningOutArticle from './_articles/shipping-daily-without-burning-out-article.tsx';
import TurningTrialUsersIntoPayingCustomersArticle from './_articles/turning-trial-users-into-paying-customers-article.tsx';
import WhyWeRewroteOurSchedulerArticle from './_articles/why-we-rewrote-our-scheduler-article.tsx';

// ----------------------------------------------------------------------

// Static slug → article-component map. Imports are eager, NOT lazy().
// Why eager: lazy() + <Suspense> caused a hydration flash on SSR — the server
// rendered the article body, then on client hydrate React would suspend
// while fetching the per-article chunk and render the null fallback (content
// disappears), then resolve and re-render (content reappears). With only ~4
// article files of placeholder content, the bundle cost is negligible and
// far better than a visible flash on every navigation.
const ARTICLE_COMPONENTS: Record<string, () => React.ReactNode> = {
	'blog-elements-reference': BlogElementsReferenceArticle,
	'multi-tenant-architecture-lessons': MultiTenantArchitectureLessonsArticle,
	'shipping-daily-without-burning-out': ShippingDailyWithoutBurningOutArticle,
	'why-we-rewrote-our-scheduler': WhyWeRewroteOurSchedulerArticle,
	'turning-trial-users-into-paying-customers':
		TurningTrialUsersIntoPayingCustomersArticle,
};

// ----------------------------------------------------------------------

const BlogArticleRoute = () => {
	const { slug } = useParams<{ slug: string }>();

	if (!slug) {
		throw new Response('Not Found', { status: 404 });
	}

	// Look up against PUBLISHED posts only — unpublished slugs 404 instead
	// of leaking the article body. Editors can still preview by flipping
	// `published: true` in `_data/blog.ts`.
	const post = getPublishedPosts().find((p) => {
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

	return <ArticleComponent />;
};

export default BlogArticleRoute;

// ----------------------------------------------------------------------

// Per-article SEO meta, derived from BLOG_POSTS. React Router calls this
// with the same params as the route, so we look up the post by slug here too.
type MetaArgs = { params: { slug?: string } };

export const meta = ({ params }: MetaArgs) => {
	// Mirror the route component's published-only lookup so meta tags don't
	// advertise an article that 404s when crawled.
	const post = getPublishedPosts().find((p) => {
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
