import {
	expect,
	test,
	type APIRequestContext,
	type Page,
} from '@playwright/test';

// The `chromium` project supplies a pre-authenticated staff-admin
// `storageState` (playwright.config.ts, review-r1-tests.md F29), which the
// `request` fixture inherits too. With that session cookie attached, a raw
// GET to `/login` gets redirected server-side to the authed workspace before
// this spec's un-hydrated login document ever renders, so the CSP/nonce
// assertions below would silently inspect the workspace instead
// (review-r2-tests.md F1). Every surface this file inspects is meant to be
// read anonymously.
test.use({ storageState: { cookies: [], origins: [] } });

type Surface = {
	path: string;
	expectedStatus: number | number[];
};

const SURFACES: Surface[] = [
	{ path: '/', expectedStatus: 200 },
	{ path: '/login', expectedStatus: 200 },
	{ path: '/nope-404', expectedStatus: 404 },
];

const extractDirective = (policy: string, name: string): string | undefined => {
	return policy
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${name} `));
};

const extractNonceFromPolicy = (policy: string): string => {
	const scriptSrc = extractDirective(policy, 'script-src');
	const match = scriptSrc?.match(/'nonce-([^']+)'/);

	expect(scriptSrc, 'script-src directive is present').toBeDefined();
	expect(match?.[1], 'script-src contains a nonce token').toBeDefined();

	return match?.[1] ?? '';
};

const extractAttribute = (
	text: string,
	attribute: string,
): string | undefined => {
	const match = text.match(
		new RegExp(
			`\\b${attribute}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?`,
		),
	);

	if (match) {
		return match[1] ?? match[2] ?? match[3];
	}
	return undefined;
};

const extractInlineScripts = (html: string) => {
	const scripts: Array<{ index: number; nonce?: string }> = [];
	const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
	let match: RegExpExecArray | null;
	let index = 0;

	while ((match = pattern.exec(html)) !== null) {
		const attrs = match[1] ?? '';
		const body = (match[2] ?? '').trim();
		const src = extractAttribute(attrs, 'src');

		if (!src && body) {
			scripts.push({ index, nonce: extractAttribute(attrs, 'nonce') });
		}

		index += 1;
	}

	return scripts;
};

const assertSurface = async (
	requestContext: APIRequestContext,
	surface: Surface,
) => {
	const response = await requestContext.get(surface.path);
	const headers = response.headers();
	const enforced = headers['content-security-policy'];
	const reportOnly = headers['content-security-policy-report-only'];
	const responseStatus = response.status();

	expect(
		new URL(response.url()).pathname,
		`${surface.path} was not silently redirected`,
	).toBe(surface.path);

	if (Array.isArray(surface.expectedStatus)) {
		expect(
			surface.expectedStatus,
			`${surface.path} status is expected one of ${surface.expectedStatus.join(',')}`,
		).toContain(responseStatus);
	} else {
		expect(responseStatus, `${surface.path} status`).toBe(
			surface.expectedStatus,
		);
	}

	expect(enforced, `${surface.path} enforced CSP header`).toBeTruthy();

	// No report-only copy of the policy, by design (review-r3-shell.md F9, fixed
	// in W3-CD `942d2844`): `applyCspHeaders` used to emit the *identical* policy
	// twice — once enforced, once report-only — while no policy carried a
	// `report-uri`/`report-to` directive. The report-only header therefore
	// reported nowhere, cost bytes on every response, and made every browser
	// parse and evaluate the same policy a second time. Asserting its ABSENCE
	// here keeps a future "let's add report-only back" from landing without also
	// adding a real reporting endpoint. Pinned at the unit level too, in
	// src/server/csp.test.ts.
	expect(
		reportOnly,
		`${surface.path} must not emit a second, report-only copy of the policy`,
	).toBeUndefined();

	const nonce = extractNonceFromPolicy(enforced ?? '');
	expect(nonce, `${surface.path} nonce in enforced policy`).toBeTruthy();

	const html = await response.text();
	const inlineScripts = extractInlineScripts(html);
	expect(
		inlineScripts.length,
		`${surface.path} inline script count`,
	).toBeGreaterThan(0);

	for (const script of inlineScripts) {
		expect(
			script.nonce,
			`${surface.path} inline script #${script.index} nonce`,
		).toBe(nonce);
	}

	return { nonce, html };
};

const assertLiveScriptNonces = async (page: Page) => {
	const result = await page.evaluate(() => {
		const metaNonce =
			document
				.querySelector('meta[name="csp-nonce"]')
				?.getAttribute('content') ?? '';
		const inlineScripts = Array.from(document.scripts)
			.map((script, index) => ({
				index,
				hasBody: Boolean(script.textContent?.trim()),
				nonce: script.nonce,
				hasSrc: Boolean(script.src),
			}))
			.filter((script) => !script.hasSrc && script.hasBody);

		return { metaNonce, inlineScripts };
	});

	expect(result.metaNonce, 'meta nonce is present in live HTML').toBeTruthy();
	expect(
		result.inlineScripts.length,
		'live inline script count',
	).toBeGreaterThan(0);

	for (const script of result.inlineScripts) {
		expect(script.nonce, `live inline script #${script.index}`).toBe(
			result.metaNonce,
		);
	}
};

test.describe('CSP headers', { tag: ['@public', '@713'] }, () => {
	test('serves CSP headers and nonced inline scripts on every HTML surface', async ({
		page,
		request,
	}) => {
		for (const surface of SURFACES) {
			await assertSurface(request, surface);
			await page.goto(surface.path);
			await assertLiveScriptNonces(page);
		}
	});

	test('mints unique nonce per document request', async ({ request }) => {
		const first = await assertSurface(request, {
			path: '/',
			expectedStatus: 200,
		});
		const second = await assertSurface(request, {
			path: '/login',
			expectedStatus: 200,
		});

		expect(first.nonce).not.toBe(second.nonce);
	});

	test('blocks nonced script that lacks nonce and executes a matching-nonce script', async ({
		page,
	}) => {
		await page.goto('/');

		const blocked = await page.evaluate(async () => {
			const violations: string[] = [];
			document.addEventListener('securitypolicyviolation', (event) => {
				violations.push(event.effectiveDirective);
			});

			const script = document.createElement('script');
			script.textContent = 'window.__front2NonceTest = "blocked"';
			document.body.append(script);
			script.remove();
			await new Promise((resolve) => window.requestAnimationFrame(resolve));

			return {
				blocked: (window as Window & { __front2NonceTest?: string })
					.__front2NonceTest,
				violations,
			};
		});

		expect(blocked.blocked).toBeUndefined();

		const ran = await page.evaluate(async () => {
			const nonce =
				document
					.querySelector('meta[name="csp-nonce"]')
					?.getAttribute('content') ?? '';
			const script = document.createElement('script');
			script.nonce = nonce;
			script.textContent = 'window.__front2NonceTest = "allowed"';
			document.body.append(script);
			script.remove();
			await new Promise((resolve) => window.requestAnimationFrame(resolve));

			return (window as Window & { __front2NonceTest?: string })
				.__front2NonceTest;
		});

		expect(ran).toBe('allowed');
	});
});
