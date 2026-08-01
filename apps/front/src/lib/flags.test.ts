import { afterEach, describe, expect, test, vi } from 'vitest';

const marketingFlagKeys = [
	'VITE_FEATURE_MARKETING_CUSTOMER_LOGOS',
	'VITE_FEATURE_MARKETING_SOCIAL_PROOF',
] as const;

const importMarketingFlags = async (
	rawValue: string | undefined,
): Promise<{ customerLogos: boolean; socialProof: boolean }> => {
	vi.resetModules();
	vi.unstubAllEnvs();
	for (const key of marketingFlagKeys) {
		vi.stubEnv(key, rawValue);
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

			expect(marketing.customerLogos).toBe(false);
			expect(marketing.socialProof).toBe(false);
		},
	);

	test('turns on both flags only for the literal true value', async () => {
		const marketing = await importMarketingFlags('true');

		expect(marketing.customerLogos).toBe(true);
		expect(marketing.socialProof).toBe(true);
	});
});
