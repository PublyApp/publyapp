import { describe, expect, test } from 'vitest';

import en from '../../../i18n/locales/en';
import fr from '../../../i18n/locales/fr';
import { AUDIENCE_CELLS } from './landing-audience';
import { CAPABILITY_FACT_KEYS } from './landing-capabilities';
import { CLAIM_KEYS } from './landing-claims';
import { FAQ_ITEMS } from './landing-faq';
import { PRICING_TIERS } from './landing-pricing';
import { TRIAL_STEPS } from './landing-trial';

// The sections build these keys from a template, which the global
// key-coverage sweep cannot check: a renamed id would show a raw key on `/`.
const TEMPLATE_KEYS = [
	...CAPABILITY_FACT_KEYS.flatMap((key) => [
		`landing-capability-${key}-lead`,
		`landing-capability-${key}-body`,
	]),
	...AUDIENCE_CELLS.flatMap((key) => [
		`landing-bento-${key}-title`,
		`landing-bento-${key}-body`,
	]),
	...FAQ_ITEMS.flatMap((item) => [
		`landing-faq-${item}-question`,
		`landing-faq-${item}-answer`,
	]),
	...PRICING_TIERS.flatMap(({ id }) => [
		`landing-pricing-${id}-name`,
		`landing-pricing-${id}-price`,
		`landing-pricing-${id}-description`,
		`landing-pricing-${id}-cta`,
	]),
	...CLAIM_KEYS.flatMap((key) => [
		`landing-claim-${key}-value`,
		`landing-claim-${key}-title`,
		`landing-claim-${key}-details`,
	]),
	...TRIAL_STEPS.flatMap((step) => [
		`landing-timeline-step-${step}-label`,
		`landing-timeline-step-${step}-title`,
		`landing-timeline-step-${step}-description`,
	]),
];

describe('landing template keys', () => {
	test.each([
		['en', en.landing],
		['fr', fr.landing],
	])('every template-built key exists in %s', (_locale, landing) => {
		const missing = TEMPLATE_KEYS.filter(
			(translationKey) => !(translationKey in landing),
		);

		expect(missing).toEqual([]);
	});
});
