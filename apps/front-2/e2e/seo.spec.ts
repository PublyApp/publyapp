import { expect, test, type APIRequestContext } from '@playwright/test';

const assertMetaFromHtml = async (
	request: APIRequestContext,
	path: string,
) => {
	const response = await request.get(path);
	const html = await response.text();

	expect(response.status(), `${path} route status`).toBeGreaterThanOrEqual(200);

	expect(html).toContain('<meta name="description"');
	expect(html).toContain('<meta name="robots"');
	expect(html).toContain('<meta property="og:title"');
	expect(html).toContain('<meta property="og:description"');
	expect(html).toContain('<meta property="og:url"');
	expect(html).toContain('<meta property="og:locale"');
	expect(html).toContain('<link rel="canonical"');
	expect(html).toContain('<link rel="alternate"');
	expect(html).toContain('hreflang="en"');
	expect(html).toContain('hreflang="fr"');
	expect(html).toContain('hreflang="x-default"');
	expect(html).toContain('<meta name="robots" content="index, follow"');
	expect(html).toContain('<link rel="sitemap"');

	return html;
};

test('renders canonical/OG/robots/sitemap/locale tags on /', async ({ request }) => {
	await assertMetaFromHtml(request, '/');
});

test('renders canonical/OG/robots/sitemap/locale tags on /login', async ({ request }) => {
	await assertMetaFromHtml(request, '/login');
});
