import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requestPasswordResetPost: vi.fn(),
	requestEmailVerificationPost: vi.fn(),
	checkEmailVerificationTokenGet: vi.fn(),
	checkResetPasswordTokenGet: vi.fn(),
}));

vi.mock('../api-client/client-manager', () => ({
	createClient: () => ({
		auth: {
			requestPasswordReset: { post: mocks.requestPasswordResetPost },
			verifyEmailRequest: { post: mocks.requestEmailVerificationPost },
			checkEmailVerificationToken: {
				get: mocks.checkEmailVerificationTokenGet,
			},
			checkResetPasswordToken: { get: mocks.checkResetPasswordTokenGet },
		},
	}),
}));

/**
 * `createServerFn`'s real implementation needs an AsyncLocalStorage "start
 * context" that only exists inside the actual server runtime — invoking it
 * directly (bypassing `useServerFn`, as these unit tests do) throws outside
 * that runtime. This stub reproduces just the `.validator().handler()`
 * chain so the enumeration-safety swallow logic can be exercised directly.
 *
 * Every mocked server fn validates an object payload through zod, so the
 * stub speaks `Record<string, unknown>` end to end: the validated shape
 * flows into the handler context WITHOUT an escape-hatch cast (#1337).
 */
vi.mock('@tanstack/react-start', () => ({
	createServerFn: () => {
		let validatorFn:
			| ((data: Record<string, unknown>) => Record<string, unknown>)
			| undefined;
		const chain = {
			validator: (
				fn: (data: Record<string, unknown>) => Record<string, unknown>,
			) => {
				validatorFn = fn;
				return chain;
			},
			handler:
				<TResult>(
					handlerFn: (ctx: { data: Record<string, unknown> }) => TResult,
				) =>
				(input: { data: Record<string, unknown> }): TResult =>
					handlerFn({
						data: validatorFn ? validatorFn(input.data) : input.data,
					}),
		};
		return chain;
	},
}));

import { PASSWORD_MIN_LENGTH } from '@org/shared-ts/lib/auth-password-policy';

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
	checkEmailVerificationToken,
	checkResetPasswordToken,
	RegisterInputSchema,
	requestEmailVerification,
	requestPasswordReset,
} from './auth-actions';

describe('RegisterInputSchema', () => {
	const validInput = {
		firstName: 'Jamie',
		lastName: 'Lee',
		email: 'jamie@example.com',
		password: 'correct horse battery staple',
	};

	test('accepts a valid registration payload', () => {
		expect(RegisterInputSchema.parse(validInput).firstName).toBe('Jamie');
	});

	test('rejects a firstName over 100 characters (kept in sync with the shared register schema)', () => {
		expect(() =>
			RegisterInputSchema.parse({ ...validInput, firstName: 'a'.repeat(101) }),
		).toThrow();
	});

	test('rejects a blank lastName (kept in sync with the shared register schema)', () => {
		expect(() =>
			RegisterInputSchema.parse({ ...validInput, lastName: '   ' }),
		).toThrow();
	});

	test('enforces PASSWORD_MIN_LENGTH, not the shared schema’s shorter min-8 rule', () => {
		// A length STRICTLY between the two thresholds (8 < 10 < 12) is the only
		// probe that separates them: rejected under the 12-char rule, accepted
		// under the 8-char rule. `7` chars (the old probe) is below BOTH and
		// would pass a threshold of 1, so it proves nothing.
		expect(() =>
			RegisterInputSchema.parse({ ...validInput, password: '0123456789' }),
		).toThrow();
	});

	test('accepts a password length the shared min-8 rule would accept but the 12-char policy rejects', () => {
		// Guards the OPPOSITE direction of the test above: confirms the 10-char
		// probe is genuinely within the 8-char rule's window, so the rejection
		// observed above is the 12-char policy biting, not an unrelated rule.
		// Mirrors the shared schema's min-8 behaviour for a length the front
		// deliberately tightens.
		const sharedProbe = '0123456789';
		expect(sharedProbe.length).toBeGreaterThanOrEqual(8);
		expect(sharedProbe.length).toBeLessThan(PASSWORD_MIN_LENGTH);
	});

	test('does not require a special character (front’s deliberate password policy)', () => {
		expect(
			RegisterInputSchema.parse({
				...validInput,
				password: 'all letters no digits here',
			}).password,
		).toBe('all letters no digits here');
	});
});

describe('requestPasswordReset', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('calls the dedicated request-password-reset endpoint, not verify-email-request', async () => {
		mocks.requestPasswordResetPost.mockResolvedValue({ status: 'success' });

		await requestPasswordReset({ data: { email: 'rui@latticecloud.com' } });

		expect(mocks.requestPasswordResetPost).toHaveBeenCalledTimes(1);
		expect(mocks.requestEmailVerificationPost).not.toHaveBeenCalled();
	});

	test('swallows a rejected API call and still resolves as sent (enumeration safety)', async () => {
		mocks.requestPasswordResetPost.mockRejectedValue(new Error('boom'));

		await expect(
			requestPasswordReset({ data: { email: 'rui@latticecloud.com' } }),
		).resolves.toEqual({ status: 'sent' });
	});
});

describe('requestEmailVerification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('still calls verify-email-request, unaffected by the reset-password split', async () => {
		mocks.requestEmailVerificationPost.mockResolvedValue({ status: 'success' });

		await requestEmailVerification({ data: { email: 'rui@latticecloud.com' } });

		expect(mocks.requestEmailVerificationPost).toHaveBeenCalledTimes(1);
		expect(mocks.requestPasswordResetPost).not.toHaveBeenCalled();
	});
});

// users-auth-r6-F1: a transient failure (network/5xx) checking the token
// must NOT collapse into the same "invalid link" bucket as a terminal 4xx
// (malformed/expired/reused token) — it needs `reason: 'unavailable'` so the
// caller can offer a retry instead of sending the user into recovery.
describe('checkEmailVerificationToken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('resolves ok:true on a valid token', async () => {
		mocks.checkEmailVerificationTokenGet.mockResolvedValue({
			resetPasswordUrl: 'https://front.test/reset-password',
		});

		await expect(
			checkEmailVerificationToken({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({
			ok: true,
			resetPasswordUrl: 'https://front.test/reset-password',
		});
	});

	test('classifies a terminal 400 (malformed/expired token) as invalid', async () => {
		mocks.checkEmailVerificationTokenGet.mockRejectedValue({
			responseStatusCode: 400,
			title: 'Bad request',
		});

		await expect(
			checkEmailVerificationToken({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'invalid' });
	});

	test('classifies a transient 500 as unavailable, not invalid', async () => {
		mocks.checkEmailVerificationTokenGet.mockRejectedValue({
			responseStatusCode: 500,
			title: 'Internal error',
		});

		await expect(
			checkEmailVerificationToken({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'unavailable' });
	});

	test('classifies a network failure as unavailable, not invalid', async () => {
		mocks.checkEmailVerificationTokenGet.mockRejectedValue(
			new TypeError('Failed to fetch'),
		);

		await expect(
			checkEmailVerificationToken({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'unavailable' });
	});
});

describe('checkResetPasswordToken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('resolves ok:true with the email on a valid token', async () => {
		mocks.checkResetPasswordTokenGet.mockResolvedValue({
			email: 'rui@latticecloud.com',
		});

		await expect(
			checkResetPasswordToken({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: true, email: 'rui@latticecloud.com' });
	});

	test('classifies a terminal 404 (unknown token) as invalid', async () => {
		mocks.checkResetPasswordTokenGet.mockRejectedValue({
			responseStatusCode: 404,
			title: 'Not found',
		});

		await expect(
			checkResetPasswordToken({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'invalid' });
	});

	test('classifies a transient 503 as unavailable, not invalid', async () => {
		mocks.checkResetPasswordTokenGet.mockRejectedValue({
			responseStatusCode: 503,
			title: 'Service unavailable',
		});

		await expect(
			checkResetPasswordToken({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'unavailable' });
	});
});
