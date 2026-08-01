import { describe, expect, test } from 'vitest';
import { I18N_NAMESPACES } from '~/lib/i18n.namespaces';

import en from './en';
import fr from './fr';

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

const cancelAnytimePatterns = [
	/\b(?:cancel|leave)[\p{L}]*\b[^.!?;·]{0,60}\b(?:any\s?time|whenever)\b/iu,
	/\b(?:annul|résili|quitt)[\p{L}]*\b[^.!?;·]{0,60}(?:à tout moment|\bquand\b[^.!?;·]{0,40}\b(?:voulez|souhait[\p{L}]*|convient)\b)/iu,
];

const landingTrialClaimPatterns = [
	...forbiddenPricingPatterns,
	...cancelAnytimePatterns,
];

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

	test('frames every landing-page trial claim as future-facing', () => {
		const localeCases = [
			{
				common: en.common as Record<string, string>,
				futureMarkers: [
					/\bplan(?:ned|s|ning)?\b/i,
					/\b(?:upcoming|forthcoming|future)\b/i,
					/\b(?:will|later|eventually)\b/i,
					/\bto come\b/i,
					/\b(?:no|not)\b[^.!?;·]{0,80}\byet\b/i,
					/\b(?:isn't|is not)\b[^.!?;·]{0,40}\b(?:yet|currently)\b/i,
				],
			},
			{
				common: fr.common as Record<string, string>,
				futureMarkers: [
					/\bprévu(?:e|es|s)?\b/i,
					/\b(?:futur(?:e|es|s)?|prochain(?:e|es|s)?)\b/i,
					/à venir/i,
					/\b(?:sera|seront)\b/i,
					/plus tard/i,
					/\bn['’](?:est|existe|a)\b[^.!?;·]{0,40}\bencore\b/i,
					/\b(?:pas|aucun(?:e|s)?)\b[^.!?;·]{0,80}\bencore\b/i,
				],
			},
		] as const;

		for (const localeCase of localeCases) {
			const landingKeys = Object.keys(localeCase.common).filter((key) =>
				key.startsWith('landing-'),
			);
			// These two marketing-shell strings also render on the landing page.
			const landingPageKeys = [
				...landingKeys,
				'marketing-start-free-trial',
				'marketing-cta-footnote',
			];

			expect(landingKeys.length).toBeGreaterThan(0);

			// The trigger set covers explicit trial words, day-count offers, card or
			// engagement disclaimers reused from the pricing guard, and cancel-anytime
			// wording. It cannot infer euphemisms outside this regex vocabulary or let
			// a future marker in a separate punctuation-delimited clause hedge a claim.
			for (const key of landingPageKeys) {
				const value = localeCase.common[key];
				const trialClauses = value
					.split(/[.!?;·]+/)
					.filter((clause) =>
						landingTrialClaimPatterns.some((pattern) => pattern.test(clause)),
					);

				for (const clause of trialClauses) {
					const hasFutureMarker = localeCase.futureMarkers.some((pattern) =>
						pattern.test(clause),
					);
					expect(
						hasFutureMarker,
						`${key} must frame every trial-offer clause as future-facing`,
					).toBe(true);
				}
			}
		}
	});

	test('keeps the trial timeline free of invented day counts', () => {
		const localeCases = [
			{
				common: en.common as Record<string, string>,
				dayCount: /\b(?:day\s+\d+|\d+\s*-?\s*days?)\b/i,
			},
			{
				common: fr.common as Record<string, string>,
				dayCount: /\b(?:jour\s+\d+|\d+\s*-?\s*jours?)\b/i,
			},
		] as const;

		for (const localeCase of localeCases) {
			const timelineKeys = Object.keys(localeCase.common).filter(
				(key) =>
					key.startsWith('landing-trial-') ||
					key.startsWith('landing-timeline-'),
			);

			expect(timelineKeys.length).toBeGreaterThan(0);

			for (const key of timelineKeys) {
				expect(localeCase.common[key]).not.toMatch(localeCase.dayCount);
			}
		}
	});
});
