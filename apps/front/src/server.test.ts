import { describe, expect, test } from 'vitest';

import {
	escapeHtml,
	injectSeoMarkup,
	isIndexableSeoRoute,
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
		const output = injectSeoMarkup(
			html,
			request('/'),
			'en',
			true,
			'https://publyapp.test',
			t,
		);

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
			'https://publyapp.test',
			t,
		);

		expect(output).toContain('<title>PublyApp</title>');
		expect(output.match(/name="csp-nonce"/g)).toHaveLength(1);
		expect(output).toContain(
			'content="PublyApp keeps your whole team and every channel moving together',
		);
		expect(output).toContain(
			'<meta name="twitter:title" content="PublyApp" />',
		);
		expect(output).toContain('<meta property="og:title" content="PublyApp" />');
	});

	test('home route gets PublyApp-branded SEO metadata in French', async () => {
		const t = await resolveSeoTranslator('fr');
		const output = injectSeoMarkup(
			htmlWithHead('PublyApp'),
			request('/'),
			'fr',
			true,
			'https://publyapp.test',
			t,
		);

		expect(output).toContain('<title>PublyApp</title>');
		expect(output).toContain(
			'content="PublyApp permet à toute votre équipe et à chaque canal d&#39;avancer ensemble',
		);
		expect(output).toContain(
			'<meta name="twitter:title" content="PublyApp" />',
		);
		expect(output).toContain('<meta property="og:title" content="PublyApp" />');
	});

	test('login route gets PublyApp-branded, localized SEO metadata', async () => {
		const en = await resolveSeoTranslator('en');
		const enOutput = injectSeoMarkup(
			htmlWithHead('Sign in to PublyApp'),
			request('/login'),
			'en',
			true,
			'https://publyapp.test',
			en,
		);
		expect(enOutput).toContain('<title>Sign in to PublyApp</title>');
		expect(enOutput).toContain(
			'content="Sign in to your PublyApp workspace to get started."',
		);
		expect(enOutput).toContain(
			'<meta name="twitter:title" content="Sign in to PublyApp" />',
		);
		expect(enOutput).toContain(
			'<meta property="og:title" content="Sign in to PublyApp" />',
		);

		const fr = await resolveSeoTranslator('fr');
		const frOutput = injectSeoMarkup(
			htmlWithHead('Connexion à PublyApp'),
			request('/login'),
			'fr',
			true,
			'https://publyapp.test',
			fr,
		);
		expect(frOutput).toContain('<title>Connexion à PublyApp</title>');
		expect(frOutput).toContain(
			'<meta name="twitter:title" content="Connexion à PublyApp" />',
		);
		expect(frOutput).toContain(
			'<meta property="og:title" content="Connexion à PublyApp" />',
		);
	});

	test('every non-indexable (authenticated) route leaves title ownership to React', async () => {
		const t = await resolveSeoTranslator('en');
		const output = injectSeoMarkup(
			htmlWithHead('PublyApp'),
			request('/staff/staff-users'),
			'en',
			false,
			'https://publyapp.test',
			t,
		);

		expect(output).toContain('<title>PublyApp</title>');
	});
});
