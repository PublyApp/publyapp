import type { z } from 'zod';

import type { AppLocale } from '../lib/i18n/resources';
import type InterZod from '../lib/zod/InterZod';

export const getEmailFieldSchema = (z: InterZod) => {
	return z.string().min(1).email().max(120);
};

const SPECIAL_CHAR_REGEX = /[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/;

const getPasswordFieldSchema = (z: InterZod) => {
	const regexMap: Record<AppLocale, string> = {
		en: 'At least 8 chars and 1 special char',
		fr: 'Au moins 8 caractères dont 1 caractère spécial',
	};

	return z
		.string()
		.min(8)
		.max(64)
		.regex(new RegExp(SPECIAL_CHAR_REGEX), regexMap[z.locale]);
};

export const getLoginSchema = (z: InterZod) => {
	return z.object({
		email: getEmailFieldSchema(z),
		password: getPasswordFieldSchema(z),
	});
};

export const getSignUpSchema = (z: InterZod) => {
	return z.object({
		firstName: z.string().min(1),
		lastName: z.string().min(1),
		email: getEmailFieldSchema(z),
		password: getPasswordFieldSchema(z),
	});
};

export const getVerifyEmailSchema = (z: InterZod) => {
	return getLoginSchema(z).pick({ email: true });
};

export const getResetPasswordSchema = (z: InterZod) => {
	return z
		.object({
			password: getPasswordFieldSchema(z),
			confirmPassword: z.string(),
		})
		.refine(
			(data) => {
				return data.confirmPassword === data.password;
			},
			{
				message: 'Passwords are not the same',
				path: ['confirmPassword'],
			},
		);
};

export const getSendEmailUpdateEmailSchema = (z: InterZod) => {
	return z.object({
		newEmail: getEmailFieldSchema(z),
	});
};

export const getRegisterSchema = (z: InterZod) => {
	return getLoginSchema(z).extend({
		firstName: z.string().min(1),
		lastName: z.string().min(1),
	});
};

export const getTenantSchema = (z: InterZod) => {
	return z.object({
		name: z.string().min(1),
		maxUsers: z.number().min(1),
		usersCount: z.number().min(0),
		logo: z.custom<File>(
			(val) => {
				return val instanceof File; // Vérifie si c'est un objet File (navigateur)
			},
			{
				message: 'Doit être un fichier valide',
			},
		),
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
