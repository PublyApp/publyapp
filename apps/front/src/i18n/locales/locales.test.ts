import { describe, expect, test } from 'vitest';
import { I18N_NAMESPACES } from '~/lib/i18n.namespaces';

import en from './en';
import fr from './fr';

// A keyword sweep cannot be complete — a trial can always be promised in
// words none of these match. These cover the phrasings a rewrite is most
// likely to reach for. The hyphen in the duration pattern matters:
// "14 days free" and "14-day free" are the same promise. The word boundary on
// essai/trial is deliberate: without it /essai/ matches inside "nécessaire"
// and /trial/ inside "industrial" — both everyday French/English — which
// would redden correct copy the moment it is swept.
const forbiddenPricingPatterns = [
	/\btrial/i,
	/\bessai/i,
	// The bare day count came from the pricing sweep, where it was scoped to
	// the seventeen landing-pricing-* keys and unambiguous. Widened to every
	// landing-*/marketing-* key, it deliberately reddens calendar-feature
	// copy that promises nothing ("Plan the next 30 days of content", "a
	// 7-day view"): the sweep cannot tell a feature name from a duration
	// offer. A feature that already exists cannot be hedged, so the response
	// is prescribed — a bare day count anywhere in landing-*/marketing-*
	// must be reworded, never hedged and never narrowed away ("7-day view" →
	// "weekly view"). Narrowing this pattern would lose the duration offers
	// that carry no free/trial/card word ("Your first 14 days are on us");
	// this PR already set the precedent by rewording "Day 3"/"Day 10" into
	// sequence language instead of narrowing the timeline regex.
	/\b\d+\s*-?\s*(day|days|jour|jours)\b/i,
	/no (credit )?card/i,
	/(sans|pas de|aucune?) (carte|engagement)/i,
];

const cancelAnytimePatterns = [
	/\b(?:cancel|leave)[\p{L}]*\b[^.!?;·]{0,60}\b(?:any\s?time|whenever)\b/iu,
	/\b(?:annul|résili|quitt)[\p{L}]*\b[^.!?;·]{0,60}(?:à tout moment|\bquand\b[^.!?;·]{0,40}\b(?:voulez|souhait[\p{L}]*|convient)\b)/iu,
];

// A bounded free period is a trial offer even when the word never appears:
// "free for your first two weeks", "deux semaines gratuites". The pricing
// patterns above already cover digit day counts; these add spelled-out
// numbers and the week/month units, in either word order. Bare articles are
// deliberately excluded: "a month"/"un mois" is this product's own scheduling
// vocabulary ("schedule a month of content"), not a duration offer.
const englishDuration = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*-?\s*(?:days?|weeks?|months?)`;
const frenchDuration = String.raw`(?:\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s*-?\s*(?:jours?|semaines?|mois)`;

const boundedFreePeriodPatterns = [
	new RegExp(String.raw`\bfree\b[^.!?;·]{0,60}\b${englishDuration}\b`, 'i'),
	new RegExp(String.raw`\b${englishDuration}\b[^.!?;·]{0,60}\bfree\b`, 'i'),
	new RegExp(
		String.raw`\bgratuit\p{L}*\b[^.!?;·]{0,60}\b${frenchDuration}\b`,
		'iu',
	),
	new RegExp(
		String.raw`\b${frenchDuration}\b[^.!?;·]{0,60}\bgratuit\p{L}*\b`,
		'iu',
	),
];

// "Pay nothing until you decide to stay" promises the same thing without
// naming a price, a duration, or a trial.
const deferredPaymentPatterns = [
	/\bpay(?:ing)?\s+nothing\b/i,
	/\bnothing\s+to\s+pay\b/i,
	/\bne\s+pay\p{L}*\s+rien\b/iu,
	/\brien\s+à\s+payer\b/iu,
];

const landingTrialClaimPatterns = [
	...forbiddenPricingPatterns,
	...cancelAnytimePatterns,
	...boundedFreePeriodPatterns,
	...deferredPaymentPatterns,
];

// Only constructions that can be a hedge and nothing else. A bare "plan"/
// "planning" or the plain future tense "will" is ordinary product and sales
// vocabulary on this page, so a present-tense regression needs no exotic
// euphemism to slip past them.
const enFutureMarkers = [
	/\bplanned\b/i,
	/\b(?:upcoming|forthcoming|future)\b/i,
	/\bto be introduced\b/i,
	/\bto come\b/i,
	/\b(?:no|not)\b[^.!?;·]{0,80}\byet\b/i,
	/\b(?:isn't|is not)\b[^.!?;·]{0,40}\b(?:yet|currently)\b/i,
];

const frFutureMarkers = [
	/\bprévu(?:e|es|s)?\b/i,
	/\b(?:futur(?:e|es|s)?|prochain(?:e|es|s)?)\b/i,
	/à venir/i,
	// "sera"/"seront" and "plus tard" are ordinary future-tense French and
	// incidental filler; drop them so they cannot hedge a live promise. The
	// shipped hedges all use prévu, à venir, or …pas encore.
	/\bn['’](?:est|existe|a)\b[^.!?;·]{0,40}\bencore\b/i,
	/\b(?:pas|aucun(?:e|s)?)\b[^.!?;·]{0,80}\bencore\b/i,
];

/**
 * The copy a visitor actually READS on a marketing surface, regardless of which
 * namespace ships it. The landing page's own copy lives in `landing`; the
 * marketing shell's header, nav, social-proof caption and closing CTA band live
 * in `common` under the `marketing-*` prefix.
 *
 * The guards below are about claims the product must be able to honour, so they
 * have to see both. Pointing them at a single namespace is what makes them stop
 * inspecting anything the day the copy moves — which is exactly what happened
 * when the landing page was promoted from `/temp/landing-05-a` to `/` and its
 * copy left `common` for its own namespace. The liveness pins in each guard
 * caught it; this merge is what keeps them pointed at the artifact.
 */
const marketingCopy = (bundle: {
	common: Record<string, string>;
	landing: Record<string, string>;
}) => ({ ...bundle.common, ...bundle.landing });

const enMarketing = marketingCopy(en);
const frMarketing = marketingCopy(fr);

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

	// A key present in BOTH namespaces would be silently shadowed by the spread in
	// `marketingCopy`, hiding one of the two strings from every guard below — a
	// false negative that no count canary can see, because the count stays right.
	test('never ships the same key in both marketing namespaces', () => {
		for (const [common, landing] of [
			[en.common, en.landing],
			[fr.common, fr.landing],
		] as const) {
			const overlap = Object.keys(landing).filter((key) => key in common);
			expect(overlap).toEqual([]);
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
		const enCommon = enMarketing;
		const frCommon = frMarketing;

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
				common: enMarketing,
				futureMarkers: enFutureMarkers,
			},
			{
				common: frMarketing,
				futureMarkers: frFutureMarkers,
			},
		] as const;

		// Liveness canary. The loop below only ever asserts about clauses the
		// trigger set actually flags; if those patterns go dead — gutted to [],
		// refactored away, or silently stopping on an accented character — the
		// whole test passes while inspecting nothing. Count the clauses the
		// triggers matched across both locales and pin it to what the committed
		// copy really contains: fourteen (seven per locale), across the timeline
		// eyebrow/title, the trial-plan note, the two FAQ clauses, the closing
		// description and the CTA footnote. Bump this when the committed copy
		// legitimately changes; never lower it to clear a dead trigger set.
		let inspectedClauseCount = 0;

		for (const localeCase of localeCases) {
			// The landing page renders strings from the `landing-*` prefix and the
			// marketing shell's `marketing-*` prefix: the shell's header, mobile
			// nav, social-proof caption and closing CTA band all appear on every
			// marketing page. A hand-picked key list missed the CTA headline and
			// body, so scan both prefixes instead.
			const landingPageKeys = Object.keys(localeCase.common).filter(
				(key) => key.startsWith('landing-') || key.startsWith('marketing-'),
			);

			expect(landingPageKeys.length).toBeGreaterThan(0);

			// The trigger set covers explicit trial words, day-count offers, card or
			// engagement disclaimers reused from the pricing guard, cancel-anytime
			// wording, a bounded free period written in digits or words, and
			// deferred-payment promises. It is still a keyword sweep: it cannot infer
			// euphemisms outside this vocabulary, and it deliberately will not let a
			// future marker in a separate punctuation-delimited clause hedge a claim.
			for (const key of landingPageKeys) {
				const value = localeCase.common[key];
				const trialClauses = value
					.split(/[.!?;·]+/)
					.filter((clause) =>
						landingTrialClaimPatterns.some((pattern) => pattern.test(clause)),
					);

				inspectedClauseCount += trialClauses.length;

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

		expect(inspectedClauseCount).toBeGreaterThanOrEqual(14);
	});

	// The total canary above cannot witness the groups that match nothing in
	// the committed copy — and three of the four match nothing there by
	// design, because the page today promises no cancel-anytime deal, no
	// bounded free period, and no deferred payment. Counting clauses can never
	// cover a group the copy never exercises. So every trigger also has to
	// prove itself against canonical unhedged promises it must match, in
	// order. Six rails keep this check honest, and any single edit that guts a
	// group breaks at least one of them:
	//   - hard counts: each group's pattern count and the spread total are
	//     pinned, so deleting a pattern — even together with its samples —
	//     reddens;
	//   - pairing: one sample list per pattern, so deleting a whole pattern's
	//     witness set also reddens;
	//   - match: each pattern must match every one of its samples, so a
	//     corrupted regex (dropped flag, broken alternation, lost word
	//     boundary) reddens;
	//   - reachability: every sample must be caught by the assembled spread,
	//     so removing a group's spread from landingTrialClaimPatterns reddens
	//     even while the group itself survives;
	//   - threat: samples are promises, not hedges — none may carry a future
	//     marker, or the pairing would pass while documenting a non-threat;
	//   - non-collapse: every pattern faces three deliberately varied
	//     phrasings, so a regex narrowed to exactly one of them fails the
	//     others. That rules out surface narrowing — collapsing a pattern to
	//     a single phrasing. It does not rule out context narrowing — adding
	//     a contextual requirement that all of a pattern's canonical samples
	//     happen to share — which passes every rail while the regex stays
	//     visibly general (all three of the day-count pattern's samples
	//     contain "free", so a free-word requirement around the day count
	//     gets through). This proves a pattern is not collapsible to a
	//     single phrase; it still does not prove the pattern is complete. A
	//     regex unioning the pinned samples would pass the samples while
	//     staying just as narrow — the sample count recorded here makes that
	//     visible to review, but no finite sample set can outrun a union of
	//     itself.
	// A suite can only survive a gutted trigger set by deleting a pattern,
	// its samples, and the pinned counts in the same edit — a coordinated act
	// the counts recorded here make visible to review, not the partial
	// deletion this test exists to catch. Bump the counts when the trigger
	// set legitimately grows; never lower them to clear a dead pattern.
	const triggerLiveness = [
		{
			label: 'forbiddenPricingPatterns',
			group: forbiddenPricingPatterns,
			samples: [
				[
					{ locale: 'en', text: 'Start your free trial today' },
					{ locale: 'en', text: 'Get trial access now' },
					{ locale: 'en', text: 'Trial available on every plan' },
				],
				[
					{ locale: 'fr', text: 'Commencez votre essai gratuit' },
					{ locale: 'fr', text: "Période d'essai offerte" },
					{ locale: 'fr', text: "L'essai est gratuit" },
				],
				[
					{ locale: 'en', text: 'Get 14 days free' },
					{ locale: 'en', text: 'Free for 30 days' },
					{ locale: 'en', text: 'Your 90-day free access' },
				],
				[
					{ locale: 'en', text: 'No credit card required' },
					{ locale: 'en', text: 'No card needed to sign up' },
					{ locale: 'en', text: 'No card, no commitment' },
				],
				[
					{ locale: 'fr', text: 'Aucun engagement, aucune carte' },
					{ locale: 'fr', text: 'Sans engagement, sans carte' },
					{ locale: 'fr', text: 'Pas de carte requise' },
				],
			],
		},
		{
			label: 'cancelAnytimePatterns',
			group: cancelAnytimePatterns,
			samples: [
				[
					{ locale: 'en', text: 'You can cancel any time' },
					{ locale: 'en', text: 'Leave whenever you like' },
					{ locale: 'en', text: 'cancel at any time' },
				],
				[
					{ locale: 'fr', text: 'Vous pouvez annuler à tout moment' },
					{ locale: 'fr', text: 'Quittez quand vous voulez' },
					{
						locale: 'fr',
						text: 'Résiliez votre abonnement quand vous souhaitez',
					},
				],
			],
		},
		{
			label: 'boundedFreePeriodPatterns',
			group: boundedFreePeriodPatterns,
			samples: [
				[
					{ locale: 'en', text: 'Free for your first two weeks' },
					{ locale: 'en', text: 'Free access for three months' },
					{ locale: 'en', text: 'Free for your first 8 weeks' },
				],
				[
					{ locale: 'en', text: 'Two weeks free' },
					{ locale: 'en', text: 'Six months free' },
					{ locale: 'en', text: 'Three days free access' },
				],
				[
					{ locale: 'fr', text: 'Gratuit pendant deux semaines' },
					{ locale: 'fr', text: 'Gratuit pour trois mois' },
					{ locale: 'fr', text: 'Accès gratuit pendant six semaines' },
				],
				[
					{ locale: 'fr', text: 'Deux semaines gratuites' },
					{ locale: 'fr', text: 'Trois mois gratuits' },
					{ locale: 'fr', text: 'Cinq jours gratuits' },
				],
			],
		},
		{
			label: 'deferredPaymentPatterns',
			group: deferredPaymentPatterns,
			samples: [
				[
					{ locale: 'en', text: 'Pay nothing until you decide to stay' },
					{ locale: 'en', text: 'Paying nothing upfront' },
					{ locale: 'en', text: 'Pay nothing to get started' },
				],
				[
					{ locale: 'en', text: 'There is nothing to pay' },
					{ locale: 'en', text: 'You have nothing to pay' },
					{ locale: 'en', text: 'Nothing to pay at checkout' },
				],
				[
					{ locale: 'fr', text: 'Vous ne payez rien' },
					{ locale: 'fr', text: 'Nous ne payons rien' },
					{ locale: 'fr', text: 'Je ne paye rien' },
				],
				[
					{ locale: 'fr', text: "Il n'y a rien à payer" },
					{ locale: 'fr', text: 'Rien à payer du tout' },
					{ locale: 'fr', text: "Vous n'avez rien à payer" },
				],
			],
		},
	];

	test('keeps every trial-claim trigger alive against canonical promises', () => {
		expect(forbiddenPricingPatterns.length).toBe(5);
		expect(cancelAnytimePatterns.length).toBe(2);
		expect(boundedFreePeriodPatterns.length).toBe(4);
		expect(deferredPaymentPatterns.length).toBe(4);
		expect(landingTrialClaimPatterns.length).toBe(15);
		expect(
			triggerLiveness.flatMap(({ samples }) => samples.flat()).length,
			'forty-five canonical promises across the trigger set',
		).toBe(45);

		for (const { label, group, samples } of triggerLiveness) {
			expect(group.length, `${label}: one sample list per pattern`).toBe(
				samples.length,
			);
			samples.forEach((patternSamples, index) => {
				expect(
					patternSamples.length,
					`${label}[${index}] must face at least two varied phrasings`,
				).toBeGreaterThanOrEqual(2);
				for (const sample of patternSamples) {
					const markers =
						sample.locale === 'en' ? enFutureMarkers : frFutureMarkers;
					expect(
						group[index].test(sample.text),
						`${label}[${index}] must match its canonical promise "${sample.text}"`,
					).toBe(true);
					expect(
						landingTrialClaimPatterns.some((spreadPattern) =>
							spreadPattern.test(sample.text),
						),
						`${label}[${index}] "${sample.text}" must be reachable through the spread`,
					).toBe(true);
					expect(
						markers.some((marker) => marker.test(sample.text)),
						`${label}[${index}] "${sample.text}" must be an unhedged promise`,
					).toBe(false);
				}
			});
		}
	});

	test('keeps the trial timeline free of invented day counts', () => {
		const localeCases = [
			{
				common: enMarketing,
				dayCount: /\b(?:day\s+\d+|\d+\s*-?\s*days?)\b/i,
			},
			{
				common: frMarketing,
				dayCount: /\b(?:jour\s+\d+|\d+\s*-?\s*jours?)\b/i,
			},
		] as const;

		for (const localeCase of localeCases) {
			const timelineKeys = Object.keys(localeCase.common).filter(
				(key) =>
					key.startsWith('landing-trial-') ||
					key.startsWith('landing-timeline-'),
			);

			// There are twelve timeline keys today (eleven landing-timeline-*
			// plus landing-trial-plan-note). Without the pin, shrinking the
			// filter below the timeline would leave keys uninspected — and
			// "Day 3" could come back green in the exact copy #1064 asked
			// to remove.
			expect(timelineKeys.length).toBeGreaterThanOrEqual(12);

			for (const key of timelineKeys) {
				expect(localeCase.common[key]).not.toMatch(localeCase.dayCount);
			}
		}
	});
});
