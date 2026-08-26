import {
	createUntypedBoolean,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { createServerFn } from '@tanstack/react-start';
import { setCookie } from '@tanstack/react-start/server';
import { z } from 'zod';

import type { AcceptInvitationBody } from '@org/client-ts/models/index';
import { PASSWORD_MIN_LENGTH } from '@org/shared-ts/lib/auth-password-policy';
import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import { selectToken } from '@org/shared-ts/lib/session/parse';

import { createClient } from '../api-client/client-manager';
import { classifyPrecheckFailure } from './precheck-outcome';
import { throwServerFailure } from './server-failure';
import {
	buildTenantSessionCookie,
	getCookieOptions,
	readSessionTokensFromCookie,
} from './session-cookie-utils';

type CheckInvitationInput = {
	id: string;
	token: string;
};

const CheckInvitationInputSchema = z.object({
	id: z.string().min(1),
	token: z.string().min(1),
});

type InvitationInfoResult =
	| {
			ok: true;
			email: string;
			profileName: string;
			userExists: boolean;
	  }
	| { ok: false; reason: 'invalid' | 'unavailable' };

/**
 * Combines the pre-validation check (email/userExists) and the display
 * details (profileName) into one round trip for the accept-invitation
 * loader — calls both endpoints and
 * collapses any failure (either call, or a missing email) to a single
 * invalid-link state.
 */
export const loadInvitationInfo = createServerFn({ method: 'POST' })
	.validator((data): CheckInvitationInput =>
		CheckInvitationInputSchema.parse(data),
	)
	.handler(async ({ data }): Promise<InvitationInfoResult> => {
		const client = createClient({ getSessionToken: () => undefined });

		try {
			const [checkResult, detailsResult] = await Promise.all([
				client.invitations.check.get({
					queryParameters: { id: data.id, token: data.token },
				}),
				client.invitations.byToken(data.token).details.get(),
			]);

			if (!detailsResult?.email) {
				return { ok: false, reason: 'invalid' };
			}

			return {
				ok: true,
				email: detailsResult.email,
				profileName: detailsResult.profileName ?? '',
				userExists: checkResult?.userExists ?? false,
			};
		} catch (error) {
			return { ok: false, reason: classifyPrecheckFailure(error) };
		}
	});

type AcceptInvitationInput =
	| {
			token: string;
			mode: 'new-user';
			firstName: string;
			lastName: string;
			password: string;
	  }
	| {
			token: string;
			mode: 'existing-account';
	  };

const AcceptInvitationInputSchema = z.discriminatedUnion('mode', [
	z.object({
		token: z.string().min(1),
		mode: z.literal('new-user'),
		firstName: z.string().min(1).max(100),
		lastName: z.string().min(1).max(100),
		password: z.string().min(PASSWORD_MIN_LENGTH).max(255),
	}),
	z.object({
		token: z.string().min(1),
		mode: z.literal('existing-account'),
	}),
]);

type AcceptInvitationResult = {
	sessionExpiresAt?: string;
	tenantId?: string;
	userId?: string;
};

/**
 * Accepts an invitation for either a brand-new account or the caller's
 * already-signed-in account, then establishes the session the same way
 * login does (setCookie here, never in the browser — see session-actions.ts).
 *
 * For useExistingAccount=true the API identifies the acting user from the
 * X-Session-Token header (not the request body), so that mode reads the
 * session token out of the incoming cookie and requires one to be present.
 */
export const acceptInvitation = createServerFn({ method: 'POST' })
	.validator((data): AcceptInvitationInput =>
		AcceptInvitationInputSchema.parse(data),
	)
	.handler(async ({ data }): Promise<AcceptInvitationResult> => {
		let sessionTokenHeader: string | undefined;

		if (data.mode === 'existing-account') {
			const { staffToken, tenantToken } = readSessionTokensFromCookie();
			sessionTokenHeader =
				selectToken({ staffToken, tenantToken }, 'tenant') ||
				selectToken({ staffToken, tenantToken }, 'staff');

			if (!sessionTokenHeader) {
				throw {
					responseStatusCode: 401,
					status: 401,
					title: 'Unauthorized',
					detail: 'missing session token',
				};
			}
		}

		const client = createClient({ getSessionToken: () => sessionTokenHeader });
		const body = {
			firstName: createUntypedString(
				data.mode === 'new-user' ? data.firstName : '',
			),
			lastName: createUntypedString(
				data.mode === 'new-user' ? data.lastName : '',
			),
			password: createUntypedString(
				data.mode === 'new-user' ? data.password : '',
			),
			useExistingAccount: createUntypedBoolean(
				data.mode === 'existing-account',
			),
		} as AcceptInvitationBody;

		let result;
		try {
			result = await client.invitations.byToken(data.token).accept.post(body);
		} catch (error) {
			throwServerFailure(error, 'failed to accept invitation');
		}

		if (!result?.sessionToken) {
			throw {
				responseStatusCode: 401,
				status: 401,
				title: 'Unauthorized',
				detail: 'missing session token',
			};
		}

		const sessionExpiresAt = result.sessionExpiresAt
			? new Date(result.sessionExpiresAt).toISOString()
			: undefined;

		setCookie(
			SESSION_TOKEN_COOKIE_KEY,
			buildTenantSessionCookie(result.sessionToken),
			getCookieOptions(sessionExpiresAt),
		);

		return {
			sessionExpiresAt,
			tenantId: result.tenantId ?? undefined,
			userId: result.userId ?? undefined,
		};
	});
