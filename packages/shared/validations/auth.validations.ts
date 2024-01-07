import { z } from 'zod';

const emailFieldSchema = z
	.string({ required_error: 'Email required' })
	.min(1, 'Email required')
	.email({ message: 'Invalid email' })
	.max(120, 'Email must be 120 chars max');
// .refine(value => value.toLowerCase());

const SPECIAL_CHAR_REGEX = /[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/;

const passwordFieldSchema = z
	.string({ required_error: 'Password required' })
	.min(8, 'Password must be 8 chars min')
	.max(64, 'Password must be 64 chars max')
	.regex(SPECIAL_CHAR_REGEX, 'At least 8 chars and 1 spacial char');

export const logInSchema = z.object({
	email: emailFieldSchema,
	password: passwordFieldSchema,
});

export const resetPasswordSchema = z
	.object({
		password: passwordFieldSchema,
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

export const sendEmailUpdateEmailSchema = z.object({
	newEmail: emailFieldSchema,
});

export type LogInInput = z.infer<typeof logInSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SendUpdateEmailFormInput = z.infer<typeof sendEmailUpdateEmailSchema>;
