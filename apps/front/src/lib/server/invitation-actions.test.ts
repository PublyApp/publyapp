import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	checkGet: vi.fn(),
	detailsGet: vi.fn(),
}));

vi.mock('../api-client/client-manager', () => ({
	createClient: () => ({
		invitations: {
			check: { get: mocks.checkGet },
			byToken: () => ({ details: { get: mocks.detailsGet } }),
		},
	}),
}));

/**
 * Same server-fn stub as auth-actions.test.ts: `createServerFn`'s real
 * implementation needs a server-runtime AsyncLocalStorage context that does
 * not exist when invoked directly in a unit test.
 */
vi.mock('@tanstack/react-start', () => ({
	createServerFn: () => {
		let validatorFn: ((data: never) => Record<string, unknown>) | undefined;
		const chain = {
			validator: (fn: (data: never) => Record<string, unknown>) => {
				validatorFn = fn;
				return chain;
			},
			handler:
				<TResult>(handlerFn: (ctx: { data: unknown }) => TResult) =>
				(input: { data: unknown }): TResult =>
					handlerFn({
						data: validatorFn ? validatorFn(input.data as never) : input.data,
					}),
		};
		return chain;
	},
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import { loadInvitationInfo } from './invitation-actions';

// users-auth-r6-F1: a transient failure (network/5xx) checking the
// invitation must NOT collapse into the same "invalid link" bucket as a
// terminal 4xx or a structurally-incomplete details response — it needs
// `reason: 'unavailable'` so the caller can offer a retry.
describe('loadInvitationInfo', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('resolves ok:true when both calls succeed and details has an email', async () => {
		mocks.checkGet.mockResolvedValue({ userExists: true });
		mocks.detailsGet.mockResolvedValue({
			email: 'rui@latticecloud.com',
			profileName: 'Approvers',
		});

		await expect(
			loadInvitationInfo({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({
			ok: true,
			email: 'rui@latticecloud.com',
			profileName: 'Approvers',
			userExists: true,
		});
	});

	test('classifies a structurally-missing email (no exception) as invalid', async () => {
		mocks.checkGet.mockResolvedValue({ userExists: false });
		mocks.detailsGet.mockResolvedValue({ email: null });

		await expect(
			loadInvitationInfo({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'invalid' });
	});

	test('classifies a terminal 400 (malformed/expired/revoked token) as invalid', async () => {
		mocks.checkGet.mockResolvedValue({ userExists: false });
		mocks.detailsGet.mockRejectedValue({
			responseStatusCode: 400,
			title: 'Bad request',
		});

		await expect(
			loadInvitationInfo({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'invalid' });
	});

	test('classifies a transient 500 as unavailable, not invalid', async () => {
		mocks.checkGet.mockResolvedValue({ userExists: false });
		mocks.detailsGet.mockRejectedValue({
			responseStatusCode: 500,
			title: 'Internal error',
		});

		await expect(
			loadInvitationInfo({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'unavailable' });
	});

	test('classifies a network failure as unavailable, not invalid', async () => {
		mocks.checkGet.mockRejectedValue(new TypeError('Failed to fetch'));
		mocks.detailsGet.mockResolvedValue({ email: 'rui@latticecloud.com' });

		await expect(
			loadInvitationInfo({ data: { id: 'user-1', token: 'tok' } }),
		).resolves.toEqual({ ok: false, reason: 'unavailable' });
	});
});
