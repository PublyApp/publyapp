import { MAX_PROFILES_PER_ACCOUNT } from '../lib/constants';
import type InterZod from '../lib/zod/InterZod';
import { getEmailFieldSchema } from './auth.validations';

export const getCreateInvitationSchema = (z: InterZod) => {
	return z.object({
		email: getEmailFieldSchema(z),
		profileIds: z
			.array(z.string().uuid(z.t('invalid-item', { item: z.t('profile') })))
			.min(1)
			.max(MAX_PROFILES_PER_ACCOUNT),
	});
};

export const getAcceptInvitationSchema = (z: InterZod) => {
	return z
		.object({
			firstName: z
				.string()
				.min(1, z.t('first-name-required'))
				.max(100)
				.optional(),
			lastName: z
				.string()
				.min(1, z.t('name-must-be-at-least-2-characters'))
				.max(100),
			password: z
				.string()
				.min(12, z.t('at-least-12-chars-and-1-special-char'))
				.max(255),
			confirmPassword: z.string(),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: z.t('passwords-do-not-match'),
			path: ['confirmPassword'],
		});
};
