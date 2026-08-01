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

	// The invariant is "no pricing CTA promises a trial", not "these two keys
	// hold these two strings". Pinning literals covered only the tiers that
	// happened to be wrong, left studio free to regress, and would break on any
	// legitimate rewording. There is no trial or billing system; a CTA that
	// offers one is a claim the product cannot honour.
	test('no pricing CTA promises a trial, in either locale', () => {
		// The imported bundles are typed as exact object literals, so they cannot
		// be indexed by a computed key without widening them first.
		const enCommon: Record<string, string> = en.common;
		const frCommon: Record<string, string> = fr.common;

		const ctaKeys = Object.keys(enCommon).filter((key) =>
			/^landing-pricing-.*-cta$/.test(key),
		);

		// Without this the loop below passes vacuously if the key shape ever
		// changes. There are three tiers today.
		expect(ctaKeys.length).toBeGreaterThanOrEqual(3);

		for (const key of ctaKeys) {
			expect(enCommon[key]).not.toMatch(/trial/i);
			expect(frCommon[key]).not.toMatch(/essai/i);
		}
	});
});
