import { describe, expect, test } from 'vitest';
import {
	PROVIDER_CAPABILITIES_QUERY_KEY,
	toDisabledProviders,
} from '~/lib/query/provider-capabilities';

import type { GetProviderCapabilitiesForTenantResponse } from '@org/client-ts/models/index';

const asResponse = (items: unknown): GetProviderCapabilitiesForTenantResponse =>
	structuredClone({ items }) as GetProviderCapabilitiesForTenantResponse;

describe('PROVIDER_CAPABILITIES_QUERY_KEY', () => {
	test('is a stable, unscoped key base', () => {
		expect([...PROVIDER_CAPABILITIES_QUERY_KEY]).toEqual([
			'provider-capabilities',
		]);
	});
});

describe('toDisabledProviders', () => {
	test('collects only the providers the operator switched off', () => {
		const disabled = toDisabledProviders(
			asResponse([
				{ provider: 'bluesky', enabled: true },
				{ provider: 'mastodon', enabled: false },
				{ provider: 'pixelfed', enabled: false },
			]),
		);

		expect([...disabled].sort()).toEqual(['mastodon', 'pixelfed']);
	});

	test('hides nothing while there is no answer', () => {
		expect(toDisabledProviders(undefined).size).toBe(0);
		expect(toDisabledProviders(null).size).toBe(0);
		expect(toDisabledProviders(asResponse([null, { provider: 3 }])).size).toBe(
			0,
		);
	});

	test('ignores an entry whose enabled flag is missing', () => {
		expect(
			toDisabledProviders(asResponse([{ provider: 'mastodon' }])).size,
		).toBe(0);
	});
});
