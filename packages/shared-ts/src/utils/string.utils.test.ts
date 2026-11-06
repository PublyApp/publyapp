import { describe, expect, test } from 'vitest';

import { slugify } from './string.utils';

describe('slugify', () => {
	test('transliterates accented Latin letters instead of dropping them', () => {
		expect(slugify('Maison Lumière')).toBe('maison-lumiere');
		expect(slugify('Café Crème')).toBe('cafe-creme');
	});

	test('transliterates ligatures', () => {
		expect(slugify('Œuvre & Cie')).toBe('oeuvre-cie');
		expect(slugify('Æther')).toBe('aether');
	});

	test('transliterates a name made only of accented letters', () => {
		expect(slugify('ÉÈÊË ÀÂÇ ÔÙÛÜ ÎÏ')).toBe('eeee-aac-ouuu-ii');
	});
});
