import { createInstance, type i18n as I18nInstance } from 'i18next';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import en from '../i18n/locales/en';
import fr from '../i18n/locales/fr';
import InterZod, { type InterZodTranslator } from './InterZod';

/**
 * #1535: the `invalid_format` branch of InterZod maps zod's snake_case
 * format names (`starts_with`, `ends_with`) to the camelCase i18n keys
 * (`startsWith`, `endsWith`) before looking them up. The mapping was
 * unpinned: no validator anywhere used the two formats, so swapping
 * `ends_with` → `endsWith` for `ends_with` → `endswith` (or dropping the
 * branch entirely) was caught by no suite. These two tests exercise the
 * mapping end-to-end through the SAME path production uses — a real
 * `z.config({ customError })` hook wired to a real InterZod instance built
 * on the real `zod` namespaces — and assert the rendered message in EN and
 * FR. A wrong mapping renders the fallback ("Invalid input") instead of the
 * resource sentence, and the assertion fails naming the locale.
 */
describe('InterZod invalid_format format-key mapping (#1535)', () => {
	const buildInterZod = (locale: 'en' | 'fr') => {
		const instance: I18nInstance = createInstance();
		void instance.init({
			lng: locale,
			fallbackLng: false,
			supportedLngs: ['en', 'fr'],
			defaultNS: 'zod',
			ns: ['zod'],
			resources: {
				en: { zod: en.zod },
				fr: { zod: fr.zod },
			},
			interpolation: { escapeValue: false },
			initAsync: false,
		});
		// i18next 26 brands its TFunction with overloaded key/options signatures
		// that are structurally richer than InterZod's `TranslateLike` (the
		// friction its header documents). The cast is the single documented
		// boundary, not a fake translator: the REAL bound i18next `t` sits under
		// it, same instance, same resources.
		const translate = instance.t.bind(instance) as InterZodTranslator;
		return new InterZod({
			i18n: {
				getFixedT: () => translate,
				t: translate,
			},
			locale,
		});
	};

	/** Parse through a validator built with the real InterZod and return the
	 * rendered message, exactly as a production form resolves it. */
	const renderInvalidFormat = (
		locale: 'en' | 'fr',
		build: (iz: InterZod) => z.ZodString,
		input: string,
	): string => {
		const interZod = buildInterZod(locale);
		z.config({
			customError: (issue) => ({ message: interZod.resolveMessage(issue) }),
		});
		const result = build(interZod).safeParse(input);
		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('expected the string-format validator to reject');
		}
		expect(result.error.issues[0]?.code).toBe('invalid_format');
		return result.error.issues[0]?.message ?? '';
	};

	// The validator under test, one per format: `.startsWith()` and
	// `.endsWith()`. Together they pin both branches of the mapping (a
	// mutation that fixes only one side leaves the other red).
	const startsWithValidator = (iz: InterZod) => iz.string().startsWith('X-');
	const endsWithValidator = (iz: InterZod) =>
		iz.string().endsWith('@publyapp.com');

	test('starts_with maps to the startsWith key in EN and FR', () => {
		expect(renderInvalidFormat('en', startsWithValidator, 'plain')).toBe(
			'Invalid string: must start with X-',
		);
		expect(renderInvalidFormat('fr', startsWithValidator, 'plain')).toBe(
			'Chaîne invalide : doit commencer par X-',
		);
	});

	test('ends_with maps to the endsWith key in EN and FR', () => {
		expect(renderInvalidFormat('en', endsWithValidator, 'user@gmail.com')).toBe(
			'Invalid string: must end with @publyapp.com',
		);
		expect(renderInvalidFormat('fr', endsWithValidator, 'user@gmail.com')).toBe(
			'Chaîne invalide : doit se terminer par @publyapp.com',
		);
	});
});
