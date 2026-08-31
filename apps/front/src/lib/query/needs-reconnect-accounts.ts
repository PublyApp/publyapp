import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { normalizeString } from '~/lib/normalize-string';

import type { FindNeedsReconnectAccountsForTenantResponse } from '@org/client-ts/models/index';

type NeedsReconnectAccount = {
	id: string;
	displayHandle: string;
	provider: string;
	lastError: string | null;
};

export type NeedsReconnectAccounts = NeedsReconnectAccount[];

/** @internal Unscoped — the tenant id rides the client's tenant header. */
const NEEDS_RECONNECT_ACCOUNTS_QUERY_KEY = [
	'needs-reconnect-accounts',
] as const;

/**
 * Maps the generated Kiota response onto the banner contract. `lastError` is
 * the server-sanitised human-readable cause and is shown verbatim (Epic C §4,
 * transparent-failure rule); a missing cause falls back to generic copy in the
 * banner rather than being invented here.
 */
export const toNeedsReconnectAccounts = (
	result: FindNeedsReconnectAccountsForTenantResponse | null | undefined,
): NeedsReconnectAccounts => {
	const accounts = result?.accounts ?? [];

	return accounts
		.map((account) => {
			const id = normalizeString(account.id?.toString());
			if (!id) {
				return null;
			}

			return {
				id,
				displayHandle: normalizeString(account.displayHandle) ?? '',
				provider: normalizeString(account.provider) ?? '',
				lastError: normalizeString(account.lastError),
			} satisfies NeedsReconnectAccount;
		})
		.filter((account) => account !== null);
};

// Session-stable per tenant: the list changes only through connect/reconnect/
// disconnect mutations, which invalidate this key explicitly. No refocus
// refetch — the banner must not flicker while the user reads the cause.

/**
 * The calling tenant's social accounts that need reconnection (C4 banner data).
 * One factory, consumed by the page hook AND the route preload (#487 §1.2).
 * The key stays UNSCOPED (the tenant id rides the client's tenant header) —
 * `buildTenantQueryOptions` would prefix `['tenant', …]` and desync the key
 * from the mutation invalidations that target `NEEDS_RECONNECT_ACCOUNTS_QUERY_KEY`.
 */
export const needsReconnectAccountsQueryOptions = {
	queryKey: (variables: { tenantId: string }) => [
		...NEEDS_RECONNECT_ACCOUNTS_QUERY_KEY,
		variables.tenantId,
	],
	fetcher: async (variables: {
		tenantId: string;
	}): Promise<FindNeedsReconnectAccountsForTenantResponse> => {
		const client = getClientManager().getOrCreateClient(variables.tenantId);
		const result = await client.socialAccounts.needsReconnectAccounts.get();

		if (!result) {
			throw new Error('needs-reconnect accounts result was empty');
		}

		return result;
	},
};

/**
 * The calling tenant's social accounts that need reconnection (C4 banner data).
 * Disabled until a workspace tenant is resolved (`useResolvedWorkspaceTenantId`).
 */
export const useNeedsReconnectAccountsQuery = (tenantId: string | null) =>
	useQuery({
		queryKey: needsReconnectAccountsQueryOptions.queryKey({
			tenantId: tenantId ?? '',
		}),
		queryFn: () =>
			needsReconnectAccountsQueryOptions.fetcher({
				tenantId: tenantId ?? '',
			}),
		enabled: tenantId !== null,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});
