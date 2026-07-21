import { describe, expect, test } from 'vitest';
import { I18N_NAMESPACES } from '~/lib/i18n.namespaces';

import en from './en';
import fr from './fr';

describe('front-2 locale manifests', () => {
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
});
