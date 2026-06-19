import { expect, test } from 'vitest';

import { createCSPHeader } from '@org/shared-ts/lib/csp';

import { applyCspHeaders, mintCspNonce } from './csp';

test('mintCspNonce returns a non-empty, unique nonce per call', () => {
	const a = mintCspNonce();
	const b = mintCspNonce();

	expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
	expect(a.length).toBeGreaterThanOrEqual(16);
	expect(a).not.toBe(b);
});

// Locks the CSP contract that makes per-script noncing load-bearing: in the PRODUCTION
// policy `script-src` carries the nonce and has NO 'unsafe-inline' (a nonce nullifies
// 'unsafe-inline' for CSP3 browsers anyway), so every inline script must be nonced.
test('production script-src includes the nonce and excludes unsafe-inline', () => {
	const nonce = mintCspNonce();
	const policy = createCSPHeader({ isDevelopment: false, nonce });

	const scriptSrc = policy
		.split(';')
		.map((d) => d.trim())
		.find((d) => d.startsWith('script-src'));

	expect(scriptSrc).toBeDefined();
	expect(scriptSrc).toContain(`'nonce-${nonce}'`);
	expect(scriptSrc).not.toContain("'unsafe-inline'");
});

// Documents the evidenced style-src verdict (Task 3.1 Step 3): 'unsafe-inline' is
// retained for styles because React Aria/HeroUI overlays apply inline style= attributes
// at runtime, which a nonce cannot cover. If this ever flips, the verdict must be revisited.
test('style-src retains unsafe-inline (overlay inline styles cannot be nonced)', () => {
	const policy = createCSPHeader({
		isDevelopment: false,
		nonce: mintCspNonce(),
	});

	const styleSrc = policy
		.split(';')
		.map((d) => d.trim())
		.find((d) => d.startsWith('style-src'));

	expect(styleSrc).toBeDefined();
	expect(styleSrc).toContain("'unsafe-inline'");
});

// Guards the exact logic the custom server entry (src/server.ts) delegates to: a given
// nonce sets BOTH headers, byte-identical (parity), with the nonce embedded. The
// entry-runs-on-404 propagation is asserted at the request level in Task 4.5.
test('applyCspHeaders sets enforced + report-only with the same nonced policy', () => {
	const nonce = mintCspNonce();
	const headers = new Headers();

	applyCspHeaders(headers, nonce, false);

	const enforced = headers.get('Content-Security-Policy');
	const reportOnly = headers.get('Content-Security-Policy-Report-Only');

	expect(enforced).toContain(`'nonce-${nonce}'`);
	expect(reportOnly).toBe(enforced);
});
