import { expect, test, type APIRequestContext } from '@playwright/test';

import { FRONT_URL } from './helpers/compose-env';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts, review-r1-tests.md F29), which the
// `request` fixture inherits too. With that session cookie attached, a raw
// GET to `/login` gets redirected server-side (an already-authenticated
// visitor is bounced to their workspace before the SEO markup is injected —
// see `injectSeoMarkup`'s `isIndexableSeoRoute`, which requires a 2xx
// status), so the description/OG assertions below would silently see no
// meta tags. Every route this file inspects is meant to be read anonymously.
test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL = FRONT_URL;

const extractAttribute = (tag: string, attribute: string): string | null => {
	const match = tag.match(
		new RegExp(
			`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
			'i',
		),
	);

	if (match === null) {
		return null;
	}

	return match[1] ?? match[2] ?? match[3] ?? null;
};

const findMetaTags = (html: string): string[] => {
	return html.match(/<meta\b[^>]*>/gi) ?? [];
};

const findLinkTags = (html: string): string[] => {
	return html.match(/<link\b[^>]*>/gi) ?? [];
};

const hasMetaTag = (
	html: string,
	selector: { name?: string; property?: string; content: string },
): boolean => {
	return findMetaTags(html).some((tag) => {
		const rawName = extractAttribute(tag, 'name');
		const rawProperty = extractAttribute(tag, 'property');
		const rawContent = extractAttribute(tag, 'content');

		if (rawContent !== selector.content) {
			return false;
		}

		if (selector.name !== undefined && rawName !== selector.name) {
			return false;
		}

		if (selector.property !== undefined && rawProperty !== selector.property) {
			return false;
		}

		return selector.name !== undefined || selector.property !== undefined;
	});
};

const hasLinkTag = (
	html: string,
	selector: { rel: string; href?: string; hreflang?: string },
): boolean => {
	return findLinkTags(html).some((tag) => {
		const rawRel = extractAttribute(tag, 'rel');
		const rawHref = extractAttribute(tag, 'href');
		const rawHrefLang = extractAttribute(tag, 'hreflang');

		if (rawRel !== selector.rel) {
			return false;
		}

		if (selector.href !== undefined && rawHref !== selector.href) {
			return false;
		}

		if (selector.hreflang !== undefined && rawHrefLang !== selector.hreflang) {
			return false;
		}

		return true;
	});
};

// Round-6 shell F1 replaced the internal front-2 scaffold copy with real,
// localized product copy (seo-*-description keys in common.en.json). These
// assertions track that copy; the gate must verify the shipped description,
// not the migration-era placeholder it used to leak.
const expectedDescription = (path: string): string =>
	path === '/login'
		? 'Sign in to your PublyApp workspace to get started.'
		: 'PublyApp keeps your whole team and every channel moving together — from first draft to published.';

const assertMetaFromHtml = async (request: APIRequestContext, path: string) => {
	const response = await request.get(path);
	const html = await response.text();
	const canonical = `${BASE_URL}${path}`;
	const sitemapUrl = `${BASE_URL}/sitemap.xml`;

	expect(response.status(), `${path} route status`).toBeGreaterThanOrEqual(200);
	expect(response.status(), `${path} route status`).toBeLessThan(300);

	expect(
		hasMetaTag(html, {
			name: 'description',
			content: expectedDescription(path),
		}),
	).toBe(true);
	expect(hasMetaTag(html, { name: 'robots', content: 'index, follow' })).toBe(
		true,
	);
	expect(hasMetaTag(html, { property: 'og:url', content: canonical })).toBe(
		true,
	);
	expect(hasMetaTag(html, { property: 'og:locale', content: 'en_US' })).toBe(
		true,
	);
	expect(
		hasMetaTag(html, { property: 'og:locale:alternate', content: 'fr_FR' }),
	).toBe(true);
	expect(hasLinkTag(html, { rel: 'canonical', href: canonical })).toBe(true);
	expect(
		hasLinkTag(html, { rel: 'alternate', href: canonical, hreflang: 'en' }),
	).toBe(true);
	expect(
		hasLinkTag(html, { rel: 'alternate', href: canonical, hreflang: 'fr' }),
	).toBe(true);
	expect(
		hasLinkTag(html, {
			rel: 'alternate',
			href: canonical,
			hreflang: 'x-default',
		}),
	).toBe(true);
	expect(hasMetaTag(html, { name: 'language', content: 'en-US' })).toBe(true);
	expect(hasLinkTag(html, { rel: 'sitemap', href: sitemapUrl })).toBe(true);

	return html;
};

test.describe('SEO metadata', { tag: ['@public', '@713'] }, () => {
	test('renders canonical/OG/robots/sitemap/locale tags on /', async ({
		request,
	}) => {
		await assertMetaFromHtml(request, '/');
	});

	test('renders canonical/OG/robots/sitemap/locale tags on /login', async ({
		request,
	}) => {
		await assertMetaFromHtml(request, '/login');
	});

	test('does not emit indexable SEO metadata on unknown routes', async ({
		request,
	}) => {
		const response = await request.get('/nope-404');
		const html = await response.text();

		expect(response.status(), '/nope-404 status').toBe(404);
		expect(
			hasMetaTag(html, {
				name: 'robots',
				content: 'noindex, nofollow',
			}),
		).toBe(true);
		expect(hasLinkTag(html, { rel: 'canonical' })).toBe(false);
		expect(hasLinkTag(html, { rel: 'alternate', hreflang: 'en' })).toBe(false);
		expect(hasLinkTag(html, { rel: 'alternate', hreflang: 'fr' })).toBe(false);
		expect(hasLinkTag(html, { rel: 'alternate', hreflang: 'x-default' })).toBe(
			false,
		);
		expect(
			hasMetaTag(html, { property: 'og:url', content: `${BASE_URL}/nope-404` }),
		).toBe(false);
	});
});
