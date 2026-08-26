import { createUntypedString } from '@microsoft/kiota-abstractions';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import InterZod, {
	type InterZodTranslator,
} from '@org/shared-ts/lib/zod/InterZod';
import { getRegisterSchema } from '@org/shared-ts/validations/auth.validations';

import { createClient } from '../api-client/client-manager';
import { PASSWORD_MIN_LENGTH } from '../auth-password-policy';
import { classifyPrecheckFailure } from './precheck-outcome';
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

/**
 * This validator never renders its messages to the user — a thrown
 * `ZodError` is caught and replaced with a translated fallback (see
 * `signup.tsx`'s `onSubmit`), so an identity translator is sufficient here.
 * It exists purely so `firstName`/`lastName`/`email` stay structurally in
 * sync with the shared `getRegisterSchema` contract instead of drifting via
 * a second hand-maintained copy.
 */
const identityTranslate: InterZodTranslator = (key) => key;

// Only `getFixedT` is supplied because this validator runs server-side
// (InterZod resolves its translator through `getFixedT` there).
const structuralZod = new InterZod({
	i18n: { getFixedT: () => identityTranslate },
});

/**
 * `password` deliberately does NOT reuse `getRegisterSchema`'s rule (min 8 +
 * special-char) — front enforces a longer, simpler `PASSWORD_MIN_LENGTH`
 * (12 chars, no special-char requirement) as its own product policy; see
 * `../auth-password-policy.ts`.
 */
export const RegisterInputSchema = getRegisterSchema(structuralZod)
	.omit({ password: true })
	.extend({ password: z.string().min(PASSWORD_MIN_LENGTH).max(64) });

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
	email: z.email().min(1).max(120),
});

/**
 * Backs the verify-email request/resend screen and the signup confirmation
 * step. The reset-password request screen uses the dedicated
 * `requestPasswordReset` below — this action only ever sends a
 * verification email, never a reset link.
 *
 * The underlying API call's outcome is deliberately swallowed (success or
 * 404-user-not-found alike) so a submitted email can never be used to probe
 * whether an account exists (old-front verify-email action was archived in `docs/archive/old-front`).
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

/**
 * Backs the reset-password request screen, calling the dedicated
 * `/auth/request-password-reset` endpoint — distinct from
 * `requestEmailVerification`, which sends a verification email and cannot
 * ever mail a reset link to an already-verified account.
 *
 * The underlying API call's outcome is deliberately swallowed (success or
 * 404-user-not-found alike) so a submitted email can never be used to probe
 * whether an account exists — the API itself is enumeration-safe (always
 * returns `{ status: "success" }`), and this mirrors that here in case of
 * network/transport failure.
 */
export const requestPasswordReset = createServerFn({ method: 'POST' })
	.validator((data): EmailInput => EmailInputSchema.parse(data))
	.handler(async ({ data }) => {
		const client = createClient({ getSessionToken: () => undefined });
		const body = {
			email: createUntypedString(data.email),
		} as Parameters<typeof client.auth.requestPasswordReset.post>[0];

		try {
			await client.auth.requestPasswordReset.post(body);
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
	| { ok: false; reason: 'invalid' | 'unavailable' };

/**
 * Malformed/expired/reused token collapses to a single `reason: 'invalid'`
 * on purpose — the API never distinguishes those cases either (see apps/api
 * CheckEmailVerificationToken.cs), so surfacing more detail here would just
 * be guesswork. A transient failure (network blip, 5xx) is a DIFFERENT
 * axis: it means the API could not be reached, not that the link is bad —
 * `classifyPrecheckFailure` keeps that reason separate (users-auth-r6-F1).
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
		} catch (error) {
			return { ok: false, reason: classifyPrecheckFailure(error) };
		}
	});

type CheckResetPasswordTokenResult =
	| { ok: true; email: string }
	| { ok: false; reason: 'invalid' | 'unavailable' };

export const checkResetPasswordToken = createServerFn({ method: 'POST' })
	.validator((data): CheckTokenInput => CheckTokenInputSchema.parse(data))
	.handler(async ({ data }): Promise<CheckResetPasswordTokenResult> => {
		const client = createClient({ getSessionToken: () => undefined });

		try {
			const result = await client.auth.checkResetPasswordToken.get({
				queryParameters: { id: data.id, token: data.token },
			});
			return { ok: true, email: result?.email ?? '' };
		} catch (error) {
			return { ok: false, reason: classifyPrecheckFailure(error) };
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
