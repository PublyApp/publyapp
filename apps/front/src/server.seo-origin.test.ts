import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// This test pins the render-time SEO output (not resolveOrigin's return value)
// against a hostile Host header, for the host-header-injection guard (#1766).
// It drives the REAL env module via process.env stubs so the production-origin
// check in resolveOrigin is exercised end-to-end, not bypassed by a module mock.
//
// SERVER_API_BASE_URL is mandatory: without it getServerEnv() raises on the
// required `apiBaseUrl` parse before resolveOrigin is ever reached — the exact
// trap that sank the first probe attempt.
const origin = 'https://publyapp.com';

const stubProductionEnv = (): void => {
	vi.stubEnv('NODE_ENV', 'production');
	vi.stubEnv('SERVER_API_BASE_URL', 'https://api.example.com');
	vi.stubEnv('PUBLIC_ORIGIN', origin);
};

describe('injectSeoMarkup — host-header injection guard (#1766)', () => {
	const html = '<html><head><title>PublyApp</title></head><body></body></html>';

	beforeEach(() => {
		stubProductionEnv();
		// Drop the memoized env parse so stubs take effect on the fresh import.
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('FORGED_HOST does not leak into rendered canonical/og:url; configured PUBLIC_ORIGIN wins', async () => {
		const { injectSeoMarkup, resolveSeoTranslator } = await import('./server');

		const t = await resolveSeoTranslator('en');
		// The request URL points at an internal host, but the Host header is
		// forged to an attacker-controlled origin.
		const request = new Request('https://internal:3000/', {
			headers: { host: 'evil.example.com' },
		});

		const output = injectSeoMarkup(html, request, 'en', true, t);

		// The forged host must not appear ANYWHERE in the rendered markup.
		expect(output).not.toContain('evil.example.com');
		// The configured PUBLIC_ORIGIN must appear in canonical and og:url.
		expect(output).toContain(`href="${origin}/"`);
		expect(output).toContain(`content="${origin}/"`);
	});
});
