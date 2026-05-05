import { index, layout, route } from '@react-router/dev/routes';

import { FEATURES } from '../../lib/features/flags.ts';

// Marketing routes — supporting pages (about/contact/security/blog) are
// flag-guarded. Disabled routes fall through to the catch-all 404 naturally.
export const marketingRoutes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
		route('pricing', 'routes/marketing/pricing/pricing-page.tsx'),
		route('terms', 'routes/marketing/terms/terms-page.tsx'),
		route('privacy', 'routes/marketing/privacy/privacy-page.tsx'),
		route('cookies', 'routes/marketing/cookies/cookies-page.tsx'),
		...(FEATURES.marketing.about
			? [route('about', 'routes/marketing/about/about-page.tsx')]
			: []),
		...(FEATURES.marketing.contact
			? [route('contact', 'routes/marketing/contact/contact-page.tsx')]
			: []),
		...(FEATURES.marketing.security
			? [route('security', 'routes/marketing/security/security-page.tsx')]
			: []),
		...(FEATURES.marketing.blog
			? [
					route('blog', 'routes/marketing/blog/blog-index-page.tsx'),
					route('blog/:slug', 'routes/marketing/blog/blog-article-route.tsx'),
				]
			: []),
		route('*', 'routes/marketing/_errors/marketing-not-found-page.tsx'),
	]),
];
