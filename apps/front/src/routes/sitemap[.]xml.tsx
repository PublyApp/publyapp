import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { FEATURES } from '#app/lib/features/flags.ts';
import { getBaseUrl } from '#app/lib/seo/canonical.ts';
import { getPublishedPosts } from '#app/routes/marketing/_data/blog.ts';
import {
	getAvailableYears,
	getEntriesForYear,
} from '#app/routes/marketing/_data/changelog.tsx';
import { COOKIES_LAST_UPDATED } from '#app/routes/marketing/_data/legal-cookies.ts';
import { PRIVACY_LAST_UPDATED } from '#app/routes/marketing/_data/legal-privacy.ts';
import { TERMS_LAST_UPDATED } from '#app/routes/marketing/_data/legal-terms.ts';

import type { Route } from './+types/sitemap[.]xml';

// ----------------------------------------------------------------------

type SitemapEntry = {
	loc: string;
	lastmod: string;
	changefreq:
		| 'always'
		| 'hourly'
		| 'daily'
		| 'weekly'
		| 'monthly'
		| 'yearly'
		| 'never';
	priority: number;
};

const escapeXml = (input: string): string => {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
};

const renderEntry = (entry: SitemapEntry): string => {
	return `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
};

const renderSitemap = (entries: SitemapEntry[]): string => {
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(renderEntry).join('\n')}
</urlset>
`;
};

// ----------------------------------------------------------------------

const STATIC_LASTMOD_FALLBACK = '2026-05-08';

const buildEntries = (baseUrl: string): SitemapEntry[] => {
	const entries: SitemapEntry[] = [];

	// Home
	entries.push({
		loc: `${baseUrl}/`,
		lastmod: STATIC_LASTMOD_FALLBACK,
		changefreq: 'monthly',
		priority: 1.0,
	});

	// Always-on static
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.pricing}`,
		lastmod: STATIC_LASTMOD_FALLBACK,
		changefreq: 'monthly',
		priority: 0.9,
	});

	// Flagged static
	if (FEATURES.marketing.about) {
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.about}`,
			lastmod: STATIC_LASTMOD_FALLBACK,
			changefreq: 'monthly',
			priority: 0.7,
		});
	}
	if (FEATURES.marketing.contact) {
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.contact}`,
			lastmod: STATIC_LASTMOD_FALLBACK,
			changefreq: 'monthly',
			priority: 0.7,
		});
	}
	if (FEATURES.marketing.security) {
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.security}`,
			lastmod: STATIC_LASTMOD_FALLBACK,
			changefreq: 'monthly',
			priority: 0.7,
		});
	}

	// Legal trio (always on)
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.terms}`,
		lastmod: TERMS_LAST_UPDATED,
		changefreq: 'yearly',
		priority: 0.3,
	});
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.privacy}`,
		lastmod: PRIVACY_LAST_UPDATED,
		changefreq: 'yearly',
		priority: 0.3,
	});
	entries.push({
		loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.cookies}`,
		lastmod: COOKIES_LAST_UPDATED,
		changefreq: 'yearly',
		priority: 0.3,
	});

	// Blog
	if (FEATURES.marketing.blog) {
		const posts = getPublishedPosts();
		const blogIndexLastmod =
			posts.length > 0 ? posts[0]!.publishedAt : STATIC_LASTMOD_FALLBACK;
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.blog}`,
			lastmod: blogIndexLastmod,
			changefreq: 'weekly',
			priority: 0.8,
		});
		for (const post of posts) {
			entries.push({
				loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.blogArticle(post.slug)}`,
				lastmod: post.publishedAt,
				changefreq: 'monthly',
				priority: 0.7,
			});
		}
	}

	// Changelog
	if (FEATURES.marketing.changelog) {
		const years = getAvailableYears();
		const allEntries = years.flatMap((y) => {
			return getEntriesForYear(y);
		});
		const changelogIndexLastmod =
			allEntries.length > 0
				? (allEntries[0]?.date ?? STATIC_LASTMOD_FALLBACK)
				: STATIC_LASTMOD_FALLBACK;
		entries.push({
			loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.changelog}`,
			lastmod: changelogIndexLastmod,
			changefreq: 'weekly',
			priority: 0.7,
		});
		for (const year of years) {
			const yearEntries = getEntriesForYear(year);
			const yearLastmod =
				yearEntries.length > 0
					? (yearEntries[0]?.date ?? STATIC_LASTMOD_FALLBACK)
					: STATIC_LASTMOD_FALLBACK;
			entries.push({
				loc: `${baseUrl}${FRONT_PATH_NAMES.marketing.changelogYear(year)}`,
				lastmod: yearLastmod,
				changefreq: 'monthly',
				priority: 0.6,
			});
		}
	}

	return entries;
};

// ----------------------------------------------------------------------

export const loader = (_args: Route.LoaderArgs) => {
	const baseUrl = getBaseUrl();
	const entries = buildEntries(baseUrl);
	const xml = renderSitemap(entries);

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
