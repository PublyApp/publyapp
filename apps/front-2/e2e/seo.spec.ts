import { expect, test, type APIRequestContext } from '@playwright/test';

const BASE_URL = 'https://front-2.localhost:8443';

const assertMetaFromHtml = async (request: APIRequestContext, path: string) => {
	const response = await request.get(path);
	const html = await response.text();
	const canonical = `${BASE_URL}${path}`;
	const sitemapUrl = `${BASE_URL}/sitemap.xml`;

	expect(response.status(), `${path} route status`).toBeGreaterThanOrEqual(200);
	expect(response.status(), `${path} route status`).toBeLessThan(300);

	expect(html).toContain('<meta name="description"');
	expect(html).toContain('<meta name="robots" content="index, follow"');
	expect(html).toContain(`<meta property="og:url" content="${canonical}"`);
	expect(html).toContain(`<meta property="og:locale" content="en_US"`);
	expect(html).toContain(
		`<meta property="og:locale:alternate" content="fr_FR"`,
	);
	expect(html).toContain(`<link rel="canonical" href="${canonical}"`);
	expect(html).toContain(
		`<link rel="alternate" href="${canonical}" hrefLang="en"`,
	);
	expect(html).toContain(
		`<link rel="alternate" href="${canonical}" hrefLang="fr"`,
	);
	expect(html).toContain(
		`<link rel="alternate" href="${canonical}" hrefLang="x-default"`,
	);
	expect(html).toContain(`<meta name="robots" content="index, follow"`);
	expect(html).toContain(`<link rel="sitemap" href="${sitemapUrl}"`);
	expect(html, `/login route has matching og:url for ${path}`).toContain(
		`<meta property="og:url" content="${canonical}"`,
	);

	return html;
};

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
