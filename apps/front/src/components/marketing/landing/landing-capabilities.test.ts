import { describe, expect, test } from 'vitest';

import en from '../../../i18n/locales/en';
import fr from '../../../i18n/locales/fr';
import { CAPABILITY_FACT_KEYS } from './landing-capabilities';

describe('landing capability facts', () => {
	test.each([
		['en', en.landing],
		['fr', fr.landing],
	])('every fact has a lead and a body in %s', (_locale, landing) => {
		const missing = CAPABILITY_FACT_KEYS.flatMap((key) => [
			`landing-capability-${key}-lead`,
			`landing-capability-${key}-body`,
		]).filter((translationKey) => !(translationKey in landing));

		expect(missing).toEqual([]);
	});
});
