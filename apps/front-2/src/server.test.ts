import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	publicApiBaseUrl: undefined as string | undefined,
}));

vi.mock('./lib/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./lib/env')>();
	return {
		...actual,
		getOptionalPublicApiBaseUrl: () => mocks.publicApiBaseUrl,
		isDevelopmentRuntime: () => false,
	};
});

import {
	escapeHtml,
	injectPublicRuntimeEnv,
	isIndexableSeoRoute,
	renderPublicEnvScript,
	resolvePublicApiBaseUrlEnv,
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

describe('resolvePublicApiBaseUrlEnv', () => {
	test('escapes a `</script>`-breaking value in the serialized payload', () => {
		mocks.publicApiBaseUrl =
			'https://api.example.test/</script><script>alert(1)</script>';

		const payload = resolvePublicApiBaseUrlEnv();

		expect(payload).toBeDefined();
		expect(payload).not.toContain('</script>');
		expect(payload).toContain('\\u003c/script>');
	});

	test('returns undefined when no public API base URL is configured', () => {
		mocks.publicApiBaseUrl = undefined;

		expect(resolvePublicApiBaseUrlEnv()).toBeUndefined();
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

	test('is a no-op when there is no payload or no </head> to inject into', () => {
		const html = '<html><head></head><body></body></html>';

		expect(injectPublicRuntimeEnv(html, undefined, 'nonce')).toBe(html);
		expect(injectPublicRuntimeEnv('<body></body>', 'payload', 'nonce')).toBe(
			'<body></body>',
		);
	});

	test('escapes a nonce value before it lands in the tag attribute', () => {
		const script = renderPublicEnvScript('{}', '"><script>alert(1)</script>');

		expect(script).not.toContain('"><script>alert(1)</script>');
		expect(script).toContain('&quot;&gt;&lt;script&gt;');
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
