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
 */
vi.mock('@tanstack/react-start', () => ({
	createServerFn: () => {
		let validatorFn: ((data: unknown) => unknown) | undefined;
		const chain = {
			validator: (fn: (data: unknown) => unknown) => {
				validatorFn = fn;
				return chain;
			},
			handler: (handlerFn: (ctx: { data: unknown }) => unknown) => {
				return (input: { data: unknown }) =>
					handlerFn({
						data: validatorFn ? validatorFn(input.data) : input.data,
					});
			},
		};
		return chain;
	},
}));

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
		expect(() =>
			RegisterInputSchema.parse({ ...validInput, password: 'short1!' }),
		).toThrow();
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
