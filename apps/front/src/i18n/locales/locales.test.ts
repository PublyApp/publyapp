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
	// legitimate rewording. There is no current trial or billing system; a CTA that
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
			/no (credit )?card/i,
			/(sans|pas de|aucune?) (carte|engagement)/i,
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

	test('frames the landing trial as planned while beta signup remains current', () => {
		const localeCases = [
			{
				common: en.common as Record<string, string>,
				signupCta: /^Sign up free$/i,
				currentContext: /\btoday\b/i,
				trial: /\bfree trial\b/i,
				planned: /planned before general availability/i,
				beta: /free while in beta/i,
				dayCount: /\bday\s+\d+\b/i,
			},
			{
				common: fr.common as Record<string, string>,
				signupCta: /^S'inscrire gratuitement$/i,
				currentContext: /aujourd'hui/i,
				trial: /\bessai gratuit\b/i,
				planned: /prévu avant l'ouverture au public/i,
				beta: /gratuit pendant la bêta/i,
				dayCount: /\bjour\s+\d+\b/i,
			},
		] as const;

		for (const localeCase of localeCases) {
			const { common } = localeCase;
			for (const key of [
				'marketing-start-free-trial',
				'landing-hero-primary-cta',
				'landing-closing-primary-cta',
			]) {
				expect(common[key]).toMatch(localeCase.signupCta);
			}

			const marketingFootnote = common['marketing-cta-footnote'];
			expect(marketingFootnote).toMatch(localeCase.trial);
			expect(marketingFootnote).toMatch(localeCase.planned);
			expect(marketingFootnote).toMatch(localeCase.beta);

			const faqAnswer = common['landing-faq-3-answer'];
			expect(faqAnswer).toMatch(localeCase.currentContext);
			expect(faqAnswer).toMatch(localeCase.trial);
			expect(faqAnswer).toMatch(localeCase.planned);
			expect(faqAnswer).toMatch(localeCase.beta);

			const timelineHeading = common['landing-timeline-eyebrow'];
			expect(timelineHeading).toMatch(localeCase.trial);
			expect(timelineHeading).toMatch(/planned|prévu/i);

			const timelineNote = common['landing-trial-plan-note'];
			expect(timelineNote).toMatch(localeCase.currentContext);
			expect(timelineNote).toMatch(localeCase.trial);
			expect(timelineNote).toMatch(localeCase.planned);
			expect(timelineNote).toMatch(localeCase.beta);

			const closingDescription = common['landing-closing-description'];
			expect(closingDescription).toMatch(localeCase.currentContext);
			expect(closingDescription).toMatch(localeCase.trial);
			expect(closingDescription).toMatch(localeCase.planned);
			expect(closingDescription).toMatch(localeCase.beta);

			for (const key of [
				'landing-trial-today-title',
				'landing-trial-day-3-title',
				'landing-trial-day-10-title',
			]) {
				expect(common[key]).not.toMatch(localeCase.dayCount);
			}
		}
	});
});
