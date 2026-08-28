import { createUntypedString } from '@microsoft/kiota-abstractions';
import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import { buildTenantQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

/** Wire statuses come from C2's `SocialAccountWire.FormatStatus`:
 * `active | needs_reconnect | revoked`. Tones follow Epic C §3 exactly —
 * green active, orange needs reconnect, GREY revoked. Deliberately NOT
 * `statusPillTone()` from components/ui/status-tone.ts: it maps `revoked` →
 * danger(red), which the spec overrides for this screen (revocation is a
 * state, not an error). */
type SocialAccountStatusWire = 'active' | 'needs_reconnect' | 'revoked';

const TONES = {
	active: 'success',
	needs_reconnect: 'warning',
	revoked: 'neutral',
} satisfies Record<SocialAccountStatusWire, 'success' | 'warning' | 'neutral'>;

// Explicit `settings:` namespace prefix — the key-coverage guard attributes
// bare literals to `common` when the module has no useTranslation() call.
// Explicit `settings:` namespace prefix — the key-coverage guard attributes
// bare literals to `common` when the module has no useTranslation() call.
const LABEL_KEYS = {
	active: 'settings:status-active',
	needs_reconnect: 'settings:status-needs-reconnect',
	revoked: 'settings:status-revoked',
} satisfies Record<SocialAccountStatusWire, string>;

export type SocialAccountRow = {
	id: string;
	provider: string;
	displayHandle: string;
	statusWire: SocialAccountStatusWire;
	tone: 'success' | 'warning' | 'neutral';
	statusLabelKey: string;
	lastSuccessAt: Date | null;
	projectIds: string[];
};

/**
 * Wide read-side view of GET /social-accounts on C2: the wrapper is
 * `CursorPaginatedResult<SocialAccountListItem>` serialising as
 * `{ data, nextCursor }` — NOT a bare array, NOT `{ value: [...] }`.
 * Item members per resolved A1. Declared wide (optional + nullable, dates as
 * `string | Date`) instead of aliasing the generated models so callers can
 * hand raw query results OR test fixtures here without casts; every field is
 * normalised defensively below.
 */
type SocialAccountWireItem = {
	id?: string | null;
	provider?: string | null;
	externalAccountId?: string | null;
	displayHandle?: string | null;
	status?: string | null;
	credentialType?: string | null;
	lastSuccessAt?: string | Date | null;
	lastError?: string | null;
	projectIds?: string[] | null;
};

export type SocialAccountsWireResponse = {
	data?: SocialAccountWireItem[] | null;
	nextCursor?: string | null;
};

const toWireStatus = (
	status: string | null | undefined,
): SocialAccountStatusWire =>
	status === 'needs_reconnect' || status === 'revoked' ? status : 'active';

const toDate = (value: string | Date | null | undefined): Date | null => {
	if (!value) {
		return null;
	}

	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.valueOf())) return null;
	return parsed;
};

const toNonEmptyString = (value: string | null | undefined): string =>
	typeof value === 'string' && value.length > 0 ? value : '';

const SOCIAL_ACCOUNTS_QUERY_KEY = ['tenant-social-accounts'] as const;

export const toSocialAccountRows = (
	response: SocialAccountsWireResponse | null | undefined,
): SocialAccountRow[] => {
	if (!response?.data) {
		return [];
	}

	const rows: SocialAccountRow[] = [];

	for (const item of response.data) {
		const statusWire = toWireStatus(item.status);
		const projectIds = Array.isArray(item.projectIds)
			? item.projectIds.filter(
					(id): id is string => typeof id === 'string' && id.length > 0,
				)
			: [];

		rows.push({
			id: toNonEmptyString(item.id),
			provider: toNonEmptyString(item.provider),
			displayHandle: toNonEmptyString(item.displayHandle),
			statusWire,
			tone: TONES[statusWire],
			statusLabelKey: LABEL_KEYS[statusWire],
			lastSuccessAt: toDate(item.lastSuccessAt),
			projectIds,
		});
	}

	return rows;
};

export const socialAccountsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	SocialAccountsWireResponse,
	Record<string, unknown>
>(
	{
		queryKeyFn: () => [...SOCIAL_ACCOUNTS_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.socialAccounts.get();
			if (!result) {
				throw new Error('social accounts result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useSocialAccountsQuery = (variables: { tenantId: string }) =>
	useQuery({
		queryKey: socialAccountsQueryOptions.queryKey(variables),
		queryFn: () => socialAccountsQueryOptions.fetcher(variables),
	});

export const invalidateSocialAccounts = (
	queryClient: QueryClient,
	tenantId: string,
): void => {
	// Reuse the factory's own queryKey builder so this can never desync from
	// the real cache key shape.
	void queryClient.invalidateQueries({
		queryKey: socialAccountsQueryOptions.queryKey({ tenantId }),
	});
};

// ── Mutations ──────────────────────────────────────────────────────
// Each one invalidates the whole list key after success so the UI never
// lies about connection state. Bodies use createUntypedString per repo
// convention (the generated bodies are UntypedNode fields).

export type ConnectSocialAccountInput = {
	tenantId: string;
	identifier: string;
	appPassword: string;
};

export const useConnectSocialAccountMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...SOCIAL_ACCOUNTS_QUERY_KEY, 'connect'],
		mutationFn: async ({
			tenantId,
			identifier,
			appPassword,
		}: ConnectSocialAccountInput) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			// C2's ConnectSocialAccountBody carries ONLY identifier +
			// appPassword; the attachment step goes through the PUT projects
			// endpoint afterwards.
			await client.socialAccounts.connect.post({
				identifier: createUntypedString(identifier),
				appPassword: createUntypedString(appPassword),
			});
		},
		onSuccess: (_data, variables) =>
			invalidateSocialAccounts(queryClient, variables.tenantId),
		meta: {
			successMessage: 'social-account-connected',
			validationHandledByForm: true,
		},
	});
};

export const useReconnectSocialAccountMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...SOCIAL_ACCOUNTS_QUERY_KEY, 'reconnect'],
		mutationFn: async ({
			tenantId,
			socialAccountId,
			appPassword,
		}: {
			tenantId: string;
			socialAccountId: string;
			appPassword: string;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.socialAccounts
				.bySocialAccountId(socialAccountId)
				.reconnect.post({
					appPassword: createUntypedString(appPassword),
				});
		},
		onSuccess: (_data, variables) =>
			invalidateSocialAccounts(queryClient, variables.tenantId),
		meta: {
			successMessage: 'social-account-reconnected',
			validationHandledByForm: true,
		},
	});
};

export const useDisconnectSocialAccountMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...SOCIAL_ACCOUNTS_QUERY_KEY, 'disconnect'],
		mutationFn: async ({
			tenantId,
			socialAccountId,
		}: {
			tenantId: string;
			socialAccountId: string;
		}) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.socialAccounts
				.bySocialAccountId(socialAccountId)
				.disconnect.post();
		},
		onSuccess: (_data, variables) =>
			invalidateSocialAccounts(queryClient, variables.tenantId),
		// C2's SHIPPED key — disconnect adds NO new i18n entry (plan Task 1).
		meta: { successMessage: 'social-account-disconnected-success' },
	});
};
