import { expect, test } from 'vitest';

import { initI18nOnClient, interZodClient } from './i18n.client';
import { createI18nFromResources, type I18nResources } from './i18n.shared';

const getI18nResources = () => {
	const resources: I18nResources = {
		en: {
			common: {},
			zod: {
				errors: {
					invalid_string: {
						email: '{{validation}} invalid',
					},
				},
				validations: {
					email: 'email',
				},
			},
			'response-message': {},
		},
		fr: {
			common: {},
			zod: {
				errors: {
					invalid_string: {
						email: '{{validation}} non valide',
					},
				},
				validations: {
					email: 'e-mail',
				},
			},
			'response-message': {},
		},
	};

	return resources;
};

test('initI18nOnClient binds InterZod to the active i18n instance locale', async () => {
	const i18n = createI18nFromResources('fr', getI18nResources());
	await initI18nOnClient(i18n);

	const result = interZodClient.string().email().safeParse('not-an-email');

	expect(result.success).toBe(false);
	expect(result.error?.issues?.[0]?.message).toContain('non valide');
});
