import { getBaseUrl } from '#app/lib/seo/canonical.ts';

import type { Route } from './+types/robots[.]txt';

// ----------------------------------------------------------------------

const buildRobotsBody = (baseUrl: string): string => {
	return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /staff/
Disallow: /auth/
Disallow: /unauthorized/

Sitemap: ${baseUrl}/sitemap.xml
`;
};

// ----------------------------------------------------------------------

export const loader = (_args: Route.LoaderArgs) => {
	const baseUrl = getBaseUrl();
	const body = buildRobotsBody(baseUrl);

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
