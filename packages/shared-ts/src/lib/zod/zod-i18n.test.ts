import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { createZodI18n, type ZodTranslator } from './zod-i18n';

/**
 * #2304: zod's own locale messages are the source of truth, no compatibility
 * layer. `createZodI18n` is the single wiring point that installs them, so this
 * suite only pins that a language switch takes effect and that an explicit
 * schema message still wins.
 */
const identity: ZodTranslator = (key) => key;

const fakeI18n = { getFixedT: () => identity, t: identity };

const firstMessage = (
	schema: z.ZodType,
	input: unknown,
): string | undefined => {
	const result = schema.safeParse(input);
	return result.success ? undefined : result.error.issues[0]?.message;
};

describe('createZodI18n installs zod 4 own locale (#2304)', () => {
	test('French messages after fr', () => {
		createZodI18n({ i18n: fakeI18n, locale: 'fr' });

		expect(firstMessage(z.string().min(3), 'ab')).toBe(
			'Trop petit : chaîne de caractères doit avoir >=3 caractères',
		);
	});

	test('English messages after en', () => {
		createZodI18n({ i18n: fakeI18n, locale: 'en' });

		expect(firstMessage(z.string().min(3), 'ab')).toBe(
			'Too small: expected string to have >=3 characters',
		);
	});

	test('an explicit schema message wins over the locale', () => {
		createZodI18n({ i18n: fakeI18n, locale: 'fr' });

		expect(firstMessage(z.string().min(3, 'message explicite'), 'ab')).toBe(
			'message explicite',
		);
	});
});
