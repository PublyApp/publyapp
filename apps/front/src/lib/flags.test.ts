import { afterEach, describe, expect, test, vi } from 'vitest';

import { FEATURES as sourceFeatures } from './flags';

type MarketingFlags = typeof sourceFeatures.marketing;

const toMarketingEnvKey = (flagKey: string): string => {
	return `VITE_FEATURE_MARKETING_${flagKey
		.replace(/[A-Z]/g, (letter) => `_${letter}`)
		.toUpperCase()}`;
};

const importMarketingFlags = async (
	rawValue: string | undefined,
): Promise<MarketingFlags> => {
	vi.resetModules();
	vi.unstubAllEnvs();
	for (const flagKey of Object.keys(sourceFeatures.marketing)) {
		vi.stubEnv(toMarketingEnvKey(flagKey), rawValue);
	}

	const { FEATURES } = await import('./flags');
	return FEATURES.marketing;
};

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('marketing feature flags', () => {
	test.each([
		['unset', undefined],
		['empty', ''],
		['false', 'false'],
	] as const)(
		'stays off when the environment value is %s',
		async (_label, rawValue) => {
			const marketing = await importMarketingFlags(rawValue);

			for (const value of Object.values(marketing)) {
				expect(value).toBe(false);
			}
		},
	);

	test('turns on both flags only for the literal true value', async () => {
		const marketing = await importMarketingFlags('true');

		for (const value of Object.values(marketing)) {
			expect(value).toBe(true);
		}
	});
});
