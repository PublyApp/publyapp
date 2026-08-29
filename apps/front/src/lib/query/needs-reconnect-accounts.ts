import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

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

const normalizeString = (value: string | null | undefined): string | null => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return null;
};

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
const fetchNeedsReconnectAccounts = async (
	tenantId: string,
): Promise<FindNeedsReconnectAccountsForTenantResponse> => {
	const client = getClientManager().getOrCreateClient(tenantId);
	const result = await client.socialAccounts.needsReconnectAccounts.get();

	if (!result) {
		throw new Error('needs-reconnect accounts result was empty');
	}

	return result;
};

/**
 * The calling tenant's social accounts that need reconnection (C4 banner data).
 * Disabled until a workspace tenant is resolved (`useResolvedWorkspaceTenantId`).
 */
export const useNeedsReconnectAccountsQuery = (tenantId: string | null) =>
	useQuery({
		queryKey: [...NEEDS_RECONNECT_ACCOUNTS_QUERY_KEY, tenantId],
		queryFn: () => fetchNeedsReconnectAccounts(tenantId as string),
		enabled: tenantId !== null,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});
