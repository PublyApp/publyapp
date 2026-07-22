import { describe, expect, test, vi } from 'vitest';

import {
	escapeHtml,
	injectPublicRuntimeEnv,
	injectSeoMarkup,
	isIndexableSeoRoute,
	renderPublicEnvScript,
	resolveSeoTranslator,
} from './server';

// This handler injects request-origin/locale-derived values into raw HTML —
// the one code path in the app where that happens (r3-shell-F10) — so its
// escaping and nonce plumbing need direct coverage, not just e2e smoke.
describe('escapeHtml', () => {
	test('escapes the five HTML-significant characters', () => {
		expect(escapeHtml(`<script>alert('x')</script> & "quoted"`)).toBe(
			'&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;',
		);
	});
});

describe('renderPublicEnvScript / injectPublicRuntimeEnv', () => {
	test('carries the nonce onto the injected script tag', () => {
		const html = '<html><head></head><body></body></html>';
		const payload = JSON.stringify({
			PUBLIC_API_BASE_URL: 'https://api.example.test',
		});

		const output = injectPublicRuntimeEnv(html, payload, 'test-nonce-123');

		expect(output).toContain('nonce="test-nonce-123"');
		expect(output).toContain('window.__ENV__');
		expect(output).toContain(payload);
	});

	test('is a no-op when there is no </head> to inject into', () => {
		expect(injectPublicRuntimeEnv('<body></body>', 'payload', 'nonce')).toBe(
			'<body></body>',
		);
	});

	test('escapes a nonce value before it lands in the tag attribute', () => {
		const script = renderPublicEnvScript('{}', '"><script>alert(1)</script>');

		expect(script).not.toContain('"><script>alert(1)</script>');
		expect(script).toContain('&quot;&gt;&lt;script&gt;');
	});

	test('injects public env before the client bootstrap script', () => {
		const html =
			'<html><head><script type="module" src="/assets/client.js"></script></head></html>';
		const output = injectPublicRuntimeEnv(html, '{}', 'nonce');

		expect(output.indexOf('window.__ENV__')).toBeLessThan(
			output.indexOf('src="/assets/client.js"'),
		);
	});

	test('renders the real registry-derived serialized payload without an env mock', async () => {
		const originalPublicApiBaseUrl = process.env.PUBLIC_API_BASE_URL;
		const originalPosthogToken = process.env.PUBLIC_POSTHOG_PROJECT_TOKEN;

		try {
			process.env.PUBLIC_API_BASE_URL = 'https://api.example.test';
			process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = 'project-token';
			vi.resetModules();
			const [{ serializePublicRuntimeEnv }, serverModule] = await Promise.all([
				import('./lib/env'),
				import('./server'),
			]);

			const script = serverModule.renderPublicEnvScript(
				serializePublicRuntimeEnv(),
				'test-nonce',
			);

			expect(script).toContain(
				'"PUBLIC_API_BASE_URL":"https://api.example.test"',
			);
			expect(script).toContain(
				'"PUBLIC_POSTHOG_PROJECT_TOKEN":"project-token"',
			);
		} finally {
			if (originalPublicApiBaseUrl === undefined) {
				delete process.env.PUBLIC_API_BASE_URL;
			} else {
				process.env.PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
			}

			if (originalPosthogToken === undefined) {
				delete process.env.PUBLIC_POSTHOG_PROJECT_TOKEN;
			} else {
				process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = originalPosthogToken;
			}
		}
	});
});

describe('isIndexableSeoRoute', () => {
	test('allows only / and /login, and only on a 2xx status', () => {
		expect(isIndexableSeoRoute('/', 200)).toBe(true);
		expect(isIndexableSeoRoute('/login', 200)).toBe(true);
		expect(isIndexableSeoRoute('/staff/staff-users', 200)).toBe(false);
		expect(isIndexableSeoRoute('/', 404)).toBe(false);
		expect(isIndexableSeoRoute('/', 500)).toBe(false);
	});
});

// shell-r6-F1: SEO metadata remains locale-aware everywhere a document is
// rendered. The React shell owns the document title so it survives hydration;
// this handler owns only string-injected SEO metadata.
describe('injectSeoMarkup / resolveSeoTranslator (shell-r6-F1)', () => {
	const html = '<html><head></head><body></body></html>';
	const request = (path: string) => new Request(`https://publyapp.test${path}`);
	const htmlWithHead = (title: string) =>
		`<html><head><title>${title}</title><meta name="csp-nonce" content="nonce" /></head><body></body></html>`;

	test('does not inject React-owned title or CSP nonce into raw HTML', async () => {
		const t = await resolveSeoTranslator('en');
		const output = injectSeoMarkup(html, request('/'), 'en', true, t);

		expect(output).not.toContain('<title>');
		expect(output).not.toContain('name="csp-nonce"');
	});

	test('home route gets PublyApp-branded SEO metadata in English', async () => {
		const t = await resolveSeoTranslator('en');
		const output = injectSeoMarkup(
			htmlWithHead('PublyApp'),
			request('/'),
			'en',
			true,
			t,
		);

		expect(output).toContain('<title>PublyApp</title>');
		expect(output.match(/name="csp-nonce"/g)).toHaveLength(1);
		expect(output).toContain(
			'content="PublyApp keeps your whole team and every channel moving together',
		);
		expect(output).not.toContain('front-2');
	});

	test('home route gets PublyApp-branded SEO metadata in French', async () => {
		const t = await resolveSeoTranslator('fr');
		const output = injectSeoMarkup(
			htmlWithHead('PublyApp'),
			request('/'),
			'fr',
			true,
			t,
		);

		expect(output).toContain('<title>PublyApp</title>');
		expect(output).toContain(
			'content="PublyApp permet à toute votre équipe et à chaque canal d&#39;avancer ensemble',
		);
		expect(output).not.toContain('front-2');
	});

	test('login route gets PublyApp-branded, localized SEO metadata', async () => {
		const en = await resolveSeoTranslator('en');
		const enOutput = injectSeoMarkup(
			htmlWithHead('Sign in to PublyApp'),
			request('/login'),
			'en',
			true,
			en,
		);
		expect(enOutput).toContain('<title>Sign in to PublyApp</title>');
		expect(enOutput).toContain(
			'content="Sign in to your PublyApp workspace to get started."',
		);

		const fr = await resolveSeoTranslator('fr');
		const frOutput = injectSeoMarkup(
			htmlWithHead('Connexion à PublyApp'),
			request('/login'),
			'fr',
			true,
			fr,
		);
		expect(frOutput).toContain('<title>Connexion à PublyApp</title>');
		expect(frOutput).not.toContain('front-2');
	});

	test('every non-indexable (authenticated) route leaves title ownership to React', async () => {
		const t = await resolveSeoTranslator('en');
		const output = injectSeoMarkup(
			htmlWithHead('PublyApp'),
			request('/staff/staff-users'),
			'en',
			false,
			t,
		);

		expect(output).toContain('<title>PublyApp</title>');
		expect(output).not.toContain('front-2');
	});
});
