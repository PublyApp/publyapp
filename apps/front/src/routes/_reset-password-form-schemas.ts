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

// This module has no `useTranslation()` of its own, so every key is
// namespace-qualified for the i18n-key-coverage guard (same pattern as
// routes/_accept-invitation-i18n-keys.ts); consumers pass their
// `useTranslation('auth')` t in, which resolves qualified keys fine.
export const getRequestFormSchema = (t: Translate) =>
	z.object({
		email: z
			.string()
			.max(120)
			.pipe(z.email(t('auth:enter-valid-email-address'))),
	});

export const getSetNewPasswordFormSchema = (t: Translate) =>
	z
		.object({
			newPassword: z.string().min(
				PASSWORD_MIN_LENGTH,
				t('auth:password-min-length-hint-n', {
					characters: PASSWORD_MIN_LENGTH,
				}),
			),
			confirmPassword: z.string().min(1, t('auth:password-is-required')),
		})
		.refine((data) => data.newPassword === data.confirmPassword, {
			message: t('auth:passwords-do-not-match'),
			path: ['confirmPassword'],
		});
