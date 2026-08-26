import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '~/lib/auth-password-policy';

export type Translate = (
	key: string,
	options?: Record<string, unknown>,
) => string;

export type RequestFormValues = { email: string };

export type SetNewPasswordFormValues = {
	newPassword: string;
	confirmPassword: string;
};

export const getRequestFormSchema = (t: Translate) =>
	z.object({
		email: z.string().max(120).email(t('enter-valid-email-address')),
	});

export const getSetNewPasswordFormSchema = (t: Translate) =>
	z
		.object({
			newPassword: z
				.string()
				.min(
					PASSWORD_MIN_LENGTH,
					t('password-min-length-hint-n', { characters: PASSWORD_MIN_LENGTH }),
				),
			confirmPassword: z.string().min(1, t('password-is-required')),
		})
		.refine((data) => data.newPassword === data.confirmPassword, {
			message: t('passwords-do-not-match'),
			path: ['confirmPassword'],
		});
