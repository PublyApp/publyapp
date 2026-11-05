import type { z } from 'zod';

import type { AppLocale } from '../lib/i18n/resources';
import type { ZodI18n } from '../lib/zod/zod-i18n';

export const getEmailFieldSchema = (z: ZodI18n) => {
	return z.email().min(1).max(120);
};

const SPECIAL_CHAR_REGEX = /[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/;

const getPasswordFieldSchema = (z: ZodI18n) => {
	const regexMap = {
		en: 'At least 8 chars and 1 special char',
		fr: 'Au moins 8 caractères dont 1 caractère spécial',
	} satisfies Record<AppLocale, string>;

	return z
		.string()
		.min(8)
		.max(64)
		.regex(new RegExp(SPECIAL_CHAR_REGEX), regexMap[z.locale]);
};

export const getLoginSchema = (z: ZodI18n) => {
	return z.object({
		email: getEmailFieldSchema(z),
		password: getPasswordFieldSchema(z),
	});
};

export const getVerifyEmailSchema = (z: ZodI18n) => {
	return getLoginSchema(z).pick({ email: true });
};

export const getResetPasswordSchema = (z: ZodI18n) => {
	return z
		.object({
			newPassword: getPasswordFieldSchema(z),
			confirmPassword: getPasswordFieldSchema(z),
		})
		.refine(
			(data) => {
				return data.confirmPassword === data.newPassword;
			},
			{
				message: 'Passwords are not the same',
				path: ['confirmPassword'],
			},
		);
};

export const getSendEmailUpdateEmailSchema = (z: ZodI18n) => {
	return z.object({
		newEmail: getEmailFieldSchema(z),
	});
};

export const getRegisterSchema = (z: ZodI18n) => {
	return getLoginSchema(z).extend({
		firstName: z.string().trim().min(1).max(100),
		lastName: z.string().trim().min(1).max(100),
	});
};

export const getEmailFormSchema = (z: ZodI18n) => {
	return z.object({
		email: getEmailFieldSchema(z),
	});
};

export const getRequestEmailVerificationSchema = (z: ZodI18n) => {
	return getEmailFormSchema(z);
};

// use server-side only. One schema serves both the email-verification and
// reset-password token checks (same `{ id, token }` wire contract); knip
// flags same-shape aliases as duplicate exports, so this is a single export.
export const getCheckTokenSchema = (z: ZodI18n) => {
	return z.object({
		token: z.string().min(1),
		id: z.string().min(1),
	});
};

export type LoginInput = z.infer<ReturnType<typeof getLoginSchema>>;
export type SignupInput = z.infer<ReturnType<typeof getRegisterSchema>>;
export type VerifyEmailInput = z.infer<ReturnType<typeof getVerifyEmailSchema>>;
export type ResetPasswordInput = z.infer<
	ReturnType<typeof getResetPasswordSchema>
>;
export type SendUpdateEmailFormInput = z.infer<
	ReturnType<typeof getSendEmailUpdateEmailSchema>
>;
