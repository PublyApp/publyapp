import { expect, test, vi } from 'vitest';

import { buildCustomFetch } from './api-client';

// Task 2.1 — Kiota custom-fetch header injection + redaction.
//
// Asserts the custom fetch sets EXACTLY the session + tenant headers (using the
// imported `@org/shared-ts` constants — `X-Session-Token` / `X-PublyApp-TenantId`,
// the latter computed by toPascalCase, never hardcoded in source) and that the secret
// session token is NEVER logged at any level.
test('sets exactly the session + tenant headers and logs nothing sensitive', async () => {
	const logs: string[] = [];
	// Capture EVERY console level — a leak at any level must fail the test.
	const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
		(lvl) =>
			vi
				.spyOn(console, lvl)
				.mockImplementation((...a: unknown[]) => logs.push(a.join(' '))),
	);

	const calls: Request[] = [];
	const fakeFetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push(new Request(url, init));
		return new Response('{}');
	}) as typeof fetch;

	const cf = buildCustomFetch({
		getSessionToken: () => 'SECRET_TOKEN',
		tenantId: 'T1',
		fetchImpl: fakeFetch,
	});
	await cf('https://api/x');

	const h = calls[0].headers;
	expect(h.get('X-Session-Token')).toBe('SECRET_TOKEN');
	expect(h.get('X-PublyApp-TenantId')).toBe('T1');
	expect(logs.join('\n')).not.toContain('SECRET_TOKEN');

	for (const spy of spies) spy.mockRestore();
});

test('omits both headers when no token and no tenant are provided', async () => {
	const calls: Request[] = [];
	const fakeFetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push(new Request(url, init));
		return new Response('{}');
	}) as typeof fetch;

	const cf = buildCustomFetch({
		getSessionToken: () => undefined,
		fetchImpl: fakeFetch,
	});
	await cf('https://api/x');

	const h = calls[0].headers;
	expect(h.get('X-Session-Token')).toBeNull();
	expect(h.get('X-PublyApp-TenantId')).toBeNull();
});
