import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createI18nFromResources } from '~/lib/i18n.shared';
import { buildI18nResources } from '~/lib/i18n.shared';

import InterZod from '@org/shared-ts/lib/zod/InterZod';

import { Field } from './fields';

const configureInterZodLocale = async (locale: 'en' | 'fr') => {
	const resources = await buildI18nResources(locale);
	const i18n = createI18nFromResources(locale, resources);
	const interZod = new InterZod({
		i18n: {
			getFixedT: i18n.getFixedT.bind(i18n),
			t: i18n.t.bind(i18n) as never,
		},
		locale,
	});

	z.setErrorMap(interZod.getErrorMap());
};

describe('Field API', () => {
	test('exposes mirrored Field.Text and Field.Email helpers', () => {
		expect(Field.Text).toBeDefined();
		expect(typeof Field.Text).toBe('function');
		expect(Field.Email).toBeDefined();
		expect(typeof Field.Email).toBe('function');
	});
});

describe('InterZod localization via zodResolver-compatible schema setup', () => {
	test('validates email with localized English message', async () => {
		await configureInterZodLocale('en');

		const schema = z.object({
			email: z.string().email(),
		});

		const result = schema.safeParse({ email: 'not-an-email' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('Invalid email');
	});

	test('validates email with localized French message', async () => {
		await configureInterZodLocale('fr');

		const schema = z.object({
			email: z.string().email(),
		});

		const result = schema.safeParse({ email: 'not-an-email' });

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe('e-mail non valide');
	});
});
