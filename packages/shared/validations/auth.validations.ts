import type { z } from 'zod';

import type { AppLocale } from '../lib/i18n/resources';
import type CustomZod from '../lib/zod/CustomZod';

const getEmailFieldSchema = (z: CustomZod) => {
	return z
		.string(/* { required_error: 'Email required' } */)
		.min(1 /* , 'Email required' */)
		.email(/* { message: 'Invalid email' } */)
		.max(120 /* , 'Email must be 120 chars max' */);
};
// .refine(value => value.toLowerCase());

const SPECIAL_CHAR_REGEX = /[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/;

const getPasswordFieldSchema = (z: CustomZod) => {
	const regexMap: Record<AppLocale, string> = {
		en: 'At least 8 chars and 1 special char',
		fr: 'Au moins 8 caractères dont 1 caractère spécial',
	};

	return z
		.string(/* { required_error: 'Password required' } */)
		.min(8 /* , 'Password must be 8 chars min' */)
		.max(64 /* , 'Password must be 64 chars max' */)
		.regex(SPECIAL_CHAR_REGEX, regexMap[z.locale]);
};

export const getLoginSchema = (z: CustomZod) => {
	return z.object({
		email: getEmailFieldSchema(z),
		password: getPasswordFieldSchema(z),
	});
};

export const getVerifyEmailSchema = (z: CustomZod) => {
	return getLoginSchema(z).pick({ email: true });
};

export const getResetPasswordSchema = (z: CustomZod) => {
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

export const getSendEmailUpdateEmailSchema = (z: CustomZod) => {
	return z.object({
		newEmail: getEmailFieldSchema(z),
	});
};

export const getRegisterSchema = (z: CustomZod) => {
	return getLoginSchema(z).extend({
		firstName: z.string(/* { required_error: 'First name required' } */).min(1),
		lastName: z.string(/* { required_error: 'Last name required' } */).min(1),
	});
};

export type LoginInput = z.infer<ReturnType<typeof getLoginSchema>>;
export type SignupInput = z.infer<ReturnType<typeof getRegisterSchema>>;
export type VerifyEmailInput = z.infer<ReturnType<typeof getVerifyEmailSchema>>;
export type ResetPasswordInput = z.infer<ReturnType<typeof getResetPasswordSchema>>;
export type SendUpdateEmailFormInput = z.infer<ReturnType<typeof getSendEmailUpdateEmailSchema>>;
