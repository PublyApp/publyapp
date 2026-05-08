import { useParams } from 'react-router';

import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { JsonLd } from '#app/components/json-ld.tsx';
import { buildCanonicalUrl } from '#app/lib/seo/canonical.ts';
import { buildSeoMeta } from '#app/lib/seo/meta.ts';
import {
	buildBlogPostingSchema,
	buildBreadcrumbListSchema,
} from '#app/lib/seo/schemas.ts';
import {
	BLOG_AUTHORS,
	getPublishedPosts,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

import type { Route } from './+types/blog-article-route';
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

	const author = BLOG_AUTHORS[post.authorId];
	const breadcrumbs = [
		{ name: 'Home', url: buildCanonicalUrl('/') },
		{ name: 'Blog', url: buildCanonicalUrl(FRONT_PATH_NAMES.marketing.blog) },
		{
			name: post.title,
			url: buildCanonicalUrl(FRONT_PATH_NAMES.marketing.blogArticle(post.slug)),
		},
	];

	return (
		<>
			{author ? <JsonLd schema={buildBlogPostingSchema(post, author)} /> : null}
			<JsonLd schema={buildBreadcrumbListSchema(breadcrumbs)} />
			<ArticleComponent />
		</>
	);
};

export default BlogArticleRoute;

// ----------------------------------------------------------------------

// Per-article SEO meta, derived from BLOG_POSTS. React Router calls this
// with the same params as the route, so we look up the post by slug here too.
export const meta = ({ params, location }: Route.MetaArgs) => {
	// Mirror the route component's published-only lookup so meta tags don't
	// advertise an article that 404s when crawled.
	const post = getPublishedPosts().find((p) => {
		return p.slug === params.slug;
	});

	if (!post) {
		return buildSeoMeta({
			title: `Not Found | ${APP_NAME}`,
			description: 'This article is no longer available.',
			pathname: location.pathname,
		});
	}

	return buildSeoMeta({
		title: `${post.title} | ${APP_NAME}`,
		description: post.excerpt,
		pathname: location.pathname,
		ogImage: unsplashCover(post.coverSlug, { w: 1200, h: 630 }),
		ogType: 'article',
	});
};
