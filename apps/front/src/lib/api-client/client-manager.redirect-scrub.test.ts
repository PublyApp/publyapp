import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';
import { describe, expect, test } from 'vitest';

// The real generated client, so the request crosses the same
// adapter/serialization path a production request takes.
import { createApiClient } from '@org/client-ts/apiClient';
import { TENANT_ID_HEADER_KEY } from '@org/shared-ts/lib/constants';

import { buildCustomFetch } from './client-manager';

/**
 * Regression guards for GHSA-396q-4vc8-28x9
 * (`@microsoft/kiota-http-fetchlibrary` — the default redirect scrub deleted
 * `Authorization`/`Cookie` under PascalCase keys that the adapter had already
 * lower-cased, so those credentials crossed origins on a 30x; patched in
 * `1.0.0-preview.102`, which iterates the key set and compares lower-cased).
 *
 * Two layers are pinned here, because the audit record
 * (docs/records/2026-07-31-audit-kiota-cross-origin-redirect-header-leak.md)
 * established that this app is protected by its own gate, not by the library:
 *
 * 1. Library level — the exact advisory defect. A bare kiota HTTP client
 *    (default middleware chain, the same `KiotaClientFactory` composition
 *    production uses) must not carry lower-cased `Authorization`/`Cookie`/
 *    `Proxy-Authorization` headers across a cross-origin 302.
 * 2. Application level — the shipped app never sends `Authorization` or
 *    `Cookie`; it authenticates with the custom `X-Session-Token` header,
 *    which no kiota version has ever scrubbed. What keeps that token off a
 *    redirect leg is the same-origin gate in `buildCustomFetch`. That gate is
 *    load-bearing, so the real generated client is driven over it against a
 *    fake fetch that redirects cross-origin and records every hop.
 */
describe('cross-origin redirect credential handling (GHSA-396q-4vc8-28x9)', () => {
	const API_ORIGIN = 'https://api.example.test';
	const ATTACK_ORIGIN = 'https://evil.example.test';

	type RecordedHop = { url: string; headers: Record<string, string> };

	const requestUrlOf = (input: RequestInfo | URL): string => {
		if (typeof input === 'string') {
			return input;
		}

		if (input instanceof URL) {
			return input.href;
		}

		return input.url;
	};

	const recordHopsFetch =
		(hops: RecordedHop[]) =>
		async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			hops.push({
				headers: Object.fromEntries(new Headers(init?.headers).entries()),
				url: requestUrlOf(input),
			});

			if (new URL(requestUrlOf(input)).origin === API_ORIGIN) {
				return new Response(null, {
					headers: { Location: `${ATTACK_ORIGIN}/catch` },
					status: 302,
				});
			}

			return new Response(JSON.stringify({ isAuthenticated: false }), {
				headers: { 'Content-Type': 'application/json' },
				status: 200,
			});
		};

	test('library: default redirect scrub strips credentials on a cross-origin 302', async () => {
		// Lower-cased keys are what FetchRequestAdapter hands the middleware
		// (getRequestFromRequestInformation lower-cases every header key); the
		// vulnerable scrub deleted PascalCase properties instead and removed
		// nothing.
		const requestInit: RequestInit = {
			headers: {
				Authorization: 'Bearer bearer-secret',
				Cookie: 'session-cookie-value',
				'Proxy-Authorization': 'proxy-secret',
			},
			method: 'GET',
		};

		const hops: RecordedHop[] = [];
		const httpClient = KiotaClientFactory.create(recordHopsFetch(hops));

		await httpClient.executeFetch(`${API_ORIGIN}/start`, requestInit);

		expect(hops.length).toBe(2);
		expect(new URL(hops[0].url).origin).toBe(API_ORIGIN);
		expect(new URL(hops[1].url).origin).toBe(ATTACK_ORIGIN);
		expect(hops[1].headers.authorization).toBeUndefined();
		expect(hops[1].headers.cookie).toBeUndefined();
		expect(hops[1].headers['proxy-authorization']).toBeUndefined();
	});

	test('app: session and tenant headers never reach the cross-origin redirect leg', async () => {
		const hops: RecordedHop[] = [];
		const customFetch = buildCustomFetch({
			apiBaseUrl: API_ORIGIN,
			fetchImpl: recordHopsFetch(hops),
			getSessionToken: () => 'session-token-secret',
			tenantId: '00000000-0000-0000-0000-000000000001',
		});
		const adapter = new FetchRequestAdapter(
			new AnonymousAuthenticationProvider(),
			undefined,
			undefined,
			// Default middleware chain, exactly as production builds it:
			// RetryHandler → RedirectHandler → … → CustomFetchHandler(customFetch).
			KiotaClientFactory.create(customFetch),
		);
		adapter.baseUrl = API_ORIGIN;
		const client = createApiClient(adapter);

		// The response payload is irrelevant to this spec; the hop record is the
		// assertion surface. Swallow whatever the generated client makes of the
		// attacker-host response.
		await client.auth.userAuthData.get().catch(() => undefined);

		expect(hops.length).toBe(2);

		const [firstHop, redirectHop] = hops;
		expect(new URL(firstHop.url).origin).toBe(API_ORIGIN);
		expect(firstHop.headers['x-session-token']).toBe('session-token-secret');
		expect(firstHop.headers[TENANT_ID_HEADER_KEY.toLowerCase()]).toBe(
			'00000000-0000-0000-0000-000000000001',
		);

		expect(new URL(redirectHop.url).origin).toBe(ATTACK_ORIGIN);
		expect(redirectHop.headers['x-session-token']).toBeUndefined();
		expect(
			redirectHop.headers[TENANT_ID_HEADER_KEY.toLowerCase()],
		).toBeUndefined();
	});
});
