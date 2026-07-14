import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requestPasswordResetPost: vi.fn(),
	requestEmailVerificationPost: vi.fn(),
}));

vi.mock('../api-client/client-manager', () => ({
	createClient: () => ({
		auth: {
			requestPasswordReset: { post: mocks.requestPasswordResetPost },
			verifyEmailRequest: { post: mocks.requestEmailVerificationPost },
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

	test('does not require a special character (front-2’s deliberate password policy)', () => {
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
