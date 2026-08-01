import { describe, expect, test } from 'vitest';
import { I18N_NAMESPACES } from '~/lib/i18n.namespaces';

import en from './en';
import fr from './fr';

describe('front locale manifests', () => {
	test('publish every registered namespace in registry order', () => {
		expect(Object.keys(en)).toEqual([...I18N_NAMESPACES]);
		expect(Object.keys(fr)).toEqual([...I18N_NAMESPACES]);
	});

	test('keep English and French keys identical per namespace', () => {
		for (const namespace of I18N_NAMESPACES) {
			expect(Object.keys(fr[namespace]).sort()).toEqual(
				Object.keys(en[namespace]).sort(),
			);
		}
	});

	// The invariant is "no pricing surface promises a trial", not "these two keys
	// hold these two strings". Pinning literals covered only the tiers that
	// happened to be wrong, left other pricing copy free to regress, and would
	// break on any
	// legitimate rewording. There is no trial or billing system; a CTA that
	// offers one is a claim the product cannot honour.
	test('no pricing surface promises a trial, in either locale', () => {
		// The imported bundles are typed as exact object literals, so they cannot
		// be indexed by a computed key without widening them first.
		const enCommon: Record<string, string> = en.common;
		const frCommon: Record<string, string> = fr.common;

		const pricingKeys = Object.keys(enCommon).filter((key) =>
			key.startsWith('landing-pricing-'),
		);
		// A keyword sweep cannot be complete — a trial can always be promised in
		// words none of these match. These cover the phrasings a rewrite is most
		// likely to reach for. The hyphen in the duration pattern matters:
		// "14 days free" and "14-day free" are the same promise.
		const forbiddenPricingPatterns = [
			/trial/i,
			/essai/i,
			/\b\d+\s*-?\s*(day|days|jour|jours)\b/i,
			/no credit card/i,
			/sans (engagement|carte)/i,
		];

		// Without this the loop below passes vacuously if the key shape ever
		// changes. There are seventeen pricing keys today.
		expect(pricingKeys.length).toBeGreaterThanOrEqual(17);

		for (const key of pricingKeys) {
			for (const pattern of forbiddenPricingPatterns) {
				expect(enCommon[key]).not.toMatch(pattern);
				expect(frCommon[key]).not.toMatch(pattern);
			}
		}
	});
});
