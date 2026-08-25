import { describe, expect, it } from 'vitest';

import en from './json/response-message.en.json';
import fr from './json/response-message.fr.json';

// Round-2 review finding 4 (PR #1439): the five Epic C step 2 response-message
// keys landed in EN and FR with no parity guard. This pins EN/FR key parity for
// the whole namespace AND names the five keys explicitly, so dropping either
// side of any future response message fails here instead of surfacing as a raw
// translationKey in a French operator's toast.
describe('response-message i18n parity', () => {
	const enKeys = Object.keys(en).sort();
	const frKeys = Object.keys(fr).sort();

	it('should define every EN response message key in FR', () => {
		const missingInFr = enKeys.filter((key) => !frKeys.includes(key));
		expect(missingInFr).toEqual([]);
	});

	it('should define every FR response message key in EN', () => {
		const missingInEn = frKeys.filter((key) => !enKeys.includes(key));
		expect(missingInEn).toEqual([]);
	});

	it('should carry non-empty values for the Epic C step 2 social-account keys', () => {
		const epicCStep2Keys = [
			'social-account-not-found',
			'social-account-disconnected-success',
			'credentials-refused',
			'provider-unreachable',
			'project-not-found',
		];
		for (const key of epicCStep2Keys) {
			expect(enKeys, `EN missing ${key}`).toContain(key);
			expect(frKeys, `FR missing ${key}`).toContain(key);
			const enValue = en[key as keyof typeof en];
			const frValue = fr[key as keyof typeof fr];
			expect(String(enValue).length, `EN empty ${key}`).toBeGreaterThan(0);
			expect(String(frValue).length, `FR empty ${key}`).toBeGreaterThan(0);
		}
	});
});
