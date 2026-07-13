import { createUntypedString } from '@microsoft/kiota-abstractions';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { createClient } from '../api-client/client-manager';
import { PASSWORD_MIN_LENGTH } from '../auth-password-policy';
import { throwServerFailure } from './server-failure';

type RegisterInput = {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
};

type RegisterResult = {
	id: string;
	email: string;
};

const RegisterInputSchema = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	email: z.string().min(1).email().max(120),
	password: z.string().min(PASSWORD_MIN_LENGTH).max(64),
});

export const register = createServerFn({ method: 'POST' })
	.validator((data): RegisterInput => RegisterInputSchema.parse(data))
	.handler(async ({ data }): Promise<RegisterResult> => {
		const client = createClient({ getSessionToken: () => undefined });
		const body = {
			firstName: createUntypedString(data.firstName),
			lastName: createUntypedString(data.lastName),
			email: createUntypedString(data.email),
			password: createUntypedString(data.password),
		} as Parameters<typeof client.auth.register.post>[0];

		try {
			const result = await client.auth.register.post(body);
			return {
				id: result?.id ?? '',
				email: result?.email ?? data.email,
			};
		} catch (error) {
			return throwServerFailure(error, 'registration failed');
		}
	});

type EmailInput = {
	email: string;
};

const EmailInputSchema = z.object({
	email: z.string().min(1).email().max(120),
});

/**
 * Backs both the verify-email request screen and the reset-password request
 * screen — there is no dedicated "request reset link" endpoint, the API
 * issues a fresh verification/reset token off the same email-verification
 * flow either way (matches apps/front's reset-password loader).
 *
 * The underlying API call's outcome is deliberately swallowed (success or
 * 404-user-not-found alike) so a submitted email can never be used to probe
 * whether an account exists, mirroring apps/front's verify-email action.
 */
export const requestEmailVerification = createServerFn({ method: 'POST' })
	.validator((data): EmailInput => EmailInputSchema.parse(data))
	.handler(async ({ data }) => {
		const client = createClient({ getSessionToken: () => undefined });
		const body = {
			email: createUntypedString(data.email),
		} as Parameters<typeof client.auth.verifyEmailRequest.post>[0];

		try {
			await client.auth.verifyEmailRequest.post(body);
		} catch {
			// Intentionally swallowed — see doc comment above.
		}

		return { status: 'sent' } as const;
	});

type CheckTokenInput = {
	id: string;
	token: string;
};

const CheckTokenInputSchema = z.object({
	id: z.string().min(1),
	token: z.string().min(1),
});

type CheckEmailVerificationTokenResult =
	| { ok: true; resetPasswordUrl?: string }
	| { ok: false };

/**
 * Any failure (malformed id/token, expired token, unknown error) collapses
 * to `ok: false` on purpose — the API never distinguishes these reasons
 * either (see apps/api CheckEmailVerificationToken.cs), so surfacing more
 * detail here would just be guesswork.
 */
export const checkEmailVerificationToken = createServerFn({ method: 'POST' })
	.validator((data): CheckTokenInput => CheckTokenInputSchema.parse(data))
	.handler(async ({ data }): Promise<CheckEmailVerificationTokenResult> => {
		const client = createClient({ getSessionToken: () => undefined });

		try {
			const result = await client.auth.checkEmailVerificationToken.get({
				queryParameters: { id: data.id, token: data.token },
			});
			return {
				ok: true,
				resetPasswordUrl: result?.resetPasswordUrl ?? undefined,
			};
		} catch {
			return { ok: false };
		}
	});

type CheckResetPasswordTokenResult =
	| { ok: true; email: string }
	| { ok: false };

export const checkResetPasswordToken = createServerFn({ method: 'POST' })
	.validator((data): CheckTokenInput => CheckTokenInputSchema.parse(data))
	.handler(async ({ data }): Promise<CheckResetPasswordTokenResult> => {
		const client = createClient({ getSessionToken: () => undefined });

		try {
			const result = await client.auth.checkResetPasswordToken.get({
				queryParameters: { id: data.id, token: data.token },
			});
			return { ok: true, email: result?.email ?? '' };
		} catch {
			return { ok: false };
		}
	});

type ResetPasswordInput = {
	id: string;
	token: string;
	newPassword: string;
	confirmPassword: string;
};

const ResetPasswordInputSchema = z.object({
	id: z.string().min(1),
	token: z.string().min(1),
	newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(64),
	confirmPassword: z.string().min(PASSWORD_MIN_LENGTH).max(64),
});

export const resetPassword = createServerFn({ method: 'POST' })
	.validator((data): ResetPasswordInput => ResetPasswordInputSchema.parse(data))
	.handler(async ({ data }) => {
		const client = createClient({ getSessionToken: () => undefined });
		const body = {
			id: createUntypedString(data.id),
			token: createUntypedString(data.token),
			newPassword: createUntypedString(data.newPassword),
			confirmPassword: createUntypedString(data.confirmPassword),
		} as Parameters<typeof client.auth.resetPassword.post>[0];

		try {
			await client.auth.resetPassword.post(body);
		} catch (error) {
			throwServerFailure(error, 'failed to reset password');
		}

		return { status: 'success' } as const;
	});
