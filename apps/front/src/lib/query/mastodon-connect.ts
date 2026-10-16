import { createUntypedString } from '@microsoft/kiota-abstractions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { invalidateSocialAccounts } from '~/lib/query/social-accounts';

const MASTODON_CONNECT_KEY = ['tenant-social-accounts', 'mastodon'] as const;

/** The fediverse networks that share this OAuth flow (Pixelfed, #2175). */
export type FediverseProvider = 'mastodon' | 'pixelfed';

/** First leg of the Mastodon/Pixelfed OAuth connect: the API registers PublyApp
 * on the instance (once per host) and returns the instance's authorize URL. */
export const useStartMastodonConnectMutation = () =>
	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- start only mints a pending authorization on the server and returns a URL; no cached query changes until the callback completes (which invalidates the list).
	useMutation({
		mutationKey: [...MASTODON_CONNECT_KEY, 'start'],
		mutationFn: async ({
			tenantId,
			instance,
			provider,
		}: {
			tenantId: string;
			instance: string;
			provider: FediverseProvider;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			const result = await client.socialAccounts.mastodon.start.post({
				instance: createUntypedString(instance),
				provider: createUntypedString(provider),
			});
			if (!result?.authorizeUrl) {
				throw new Error('mastodon authorize url was empty');
			}

			return result.authorizeUrl;
		},
		meta: { validationHandledByForm: true },
	});

/** Last leg: the instance sent the browser back with `code` and `state`. */
export const useCompleteMastodonConnectMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...MASTODON_CONNECT_KEY, 'complete'],
		mutationFn: async ({
			tenantId,
			code,
			state,
		}: {
			tenantId: string;
			code: string;
			state: string;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.socialAccounts.mastodon.callback.post({
				code: createUntypedString(code),
				state: createUntypedString(state),
			});
		},
		onSuccess: (_data, variables) =>
			invalidateSocialAccounts(queryClient, variables.tenantId),
		meta: { successMessage: 'social-account-fediverse-connected' },
	});
};
