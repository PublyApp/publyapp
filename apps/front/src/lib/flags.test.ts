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
	isProduction = false,
): Promise<MarketingFlags> => {
	vi.resetModules();
	vi.unstubAllEnvs();
	// Vitest's `import.meta.env` is a proxy that coerces DEV/PROD/SSR from
	// `process.env`, and `stubEnv` writes only the key it is handed — so
	// stubbing PROD alone leaves DEV true, a state no real build produces
	// (vite resolves `DEV: !isProduction` and inlines it). A default reading
	// any un-stubbed build-time constant would then evaluate one way here and
	// the opposite in the shipped bundle. Stub the whole set together.
	vi.stubEnv('MODE', isProduction ? 'production' : 'test');
	vi.stubEnv('PROD', isProduction);
	vi.stubEnv('DEV', !isProduction);
	vi.stubEnv('SSR', false);
	for (const flagKey of Object.keys(sourceFeatures.marketing)) {
		vi.stubEnv(toMarketingEnvKey(flagKey), rawValue);
	}

	const { FEATURES } = await import('./flags');
	// Guards the three `for...of Object.values(marketing)` loops below: an
	// empty registry would make every one of them pass vacuously.
	expect(Object.keys(FEATURES.marketing).length).toBeGreaterThan(0);
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
		['numeric truthy', '1'],
		['word truthy', 'yes'],
		['uppercase true', 'TRUE'],
	] as const)(
		'stays off when the environment value is %s',
		async (_label, rawValue) => {
			const marketing = await importMarketingFlags(rawValue);

			for (const value of Object.values(marketing)) {
				expect(value).toBe(false);
			}
		},
	);

	test('stays off when production mode has no environment values', async () => {
		const marketing = await importMarketingFlags(undefined, true);

		for (const value of Object.values(marketing)) {
			expect(value).toBe(false);
		}
	});

	test('turns on both flags only for the literal true value', async () => {
		const marketing = await importMarketingFlags('true');

		for (const value of Object.values(marketing)) {
			expect(value).toBe(true);
		}
	});
});
