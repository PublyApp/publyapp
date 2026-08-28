import { createUntypedString } from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import {
	normalizeNullableFileUrl,
	toRootRelativeApiFileUrl,
} from '~/lib/api-client/resolve-api-file-url';

import type {
	TenantSettingsGeneralResult,
	UpdateTenantSettingsGeneralBody,
} from '@org/client-ts/models/index';

export type TenantSettingsGeneral = {
	id: string;
	code: string | null;
	name: string;
	logoUrl: string | null;
	legalName: string | null;
	description: string | null;
	websiteUrl: string | null;
	billingEmail: string | null;
	supportEmail: string | null;
	defaultLocale: string | null;
	timezone: string | null;
};

export type TenantSettingsGeneralUpdateInput = {
	tenantId: string;
	name?: string;
	logoUrl?: string | null;
	legalName?: string | null;
	description?: string | null;
	websiteUrl?: string | null;
	billingEmail?: string | null;
	supportEmail?: string | null;
	defaultLocale?: string | null;
	timezone?: string | null;
};

/** @internal Unscoped — the tenant id is appended by the hooks below. */
const TENANT_SETTINGS_GENERAL_QUERY_KEY = ['tenant-settings-general'] as const;

const normalizeString = (value: string | null | undefined): string | null => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) return trimmed;
	return null;
};

export const toTenantSettingsGeneral = (
	result: TenantSettingsGeneralResult | null | undefined,
): TenantSettingsGeneral | null => {
	const id = normalizeString(result?.id?.toString() ?? undefined);
	if (!id) {
		return null;
	}

	return {
		id,
		code: normalizeString(result?.code),
		name: normalizeString(result?.name) ?? '',
		logoUrl: normalizeNullableFileUrl(result?.logoUrl),
		legalName: normalizeString(result?.legalName),
		description: normalizeString(result?.description),
		websiteUrl: normalizeString(result?.websiteUrl),
		billingEmail: normalizeString(result?.billingEmail),
		supportEmail: normalizeString(result?.supportEmail),
		defaultLocale: normalizeString(result?.defaultLocale),
		timezone: normalizeString(result?.timezone),
	};
};

const fetchTenantSettingsGeneral = async (
	tenantId: string,
): Promise<TenantSettingsGeneralResult> => {
	const client = getClientManager().getOrCreateClient(tenantId);
	const result = await client.settings.general.get();

	if (!result) {
		throw new Error('tenant settings general result was empty');
	}

	return result;
};

const updateTenantSettingsGeneral = async (
	input: TenantSettingsGeneralUpdateInput,
): Promise<TenantSettingsGeneralResult> => {
	const client = getClientManager().getOrCreateClient(input.tenantId);
	const result = await client.settings.general.patch(
		buildUpdateTenantSettingsGeneralBody(input),
	);

	if (!result) {
		throw new Error('updated tenant settings general result was empty');
	}

	return result;
};

const normalizeUpdateStringField = (
	value: string | null | undefined,
): string | null | undefined => {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) return trimmed;
	return null;
};

const CLEARABLE_BODY_FIELDS = [
	'logoUrl',
	'legalName',
	'description',
	'websiteUrl',
	'billingEmail',
	'supportEmail',
	'defaultLocale',
	'timezone',
] as const;

export const buildUpdateTenantSettingsGeneralBody = (
	input: TenantSettingsGeneralUpdateInput,
): UpdateTenantSettingsGeneralBody => {
	const body: UpdateTenantSettingsGeneralBody = {};

	if (input.name !== undefined) {
		const name = input.name.trim();
		if (name.length > 0) {
			body.name = createUntypedString(name);
		}
	}

	for (const key of CLEARABLE_BODY_FIELDS) {
		const value = input[key];
		if (value === undefined) {
			continue;
		}

		const normalized = normalizeUpdateStringField(value);
		body[key] =
			normalized == null
				? null
				: createUntypedString(
						key === 'logoUrl'
							? toRootRelativeApiFileUrl(normalized)
							: normalized,
					);
	}

	return body;
};

/**
 * The tenant's general settings. `tenantId` comes from the resolved
 * workspace tenant (see `useResolvedWorkspaceTenantId`); the hook is
 * disabled until a tenant is actually resolved.
 */
export const useTenantSettingsGeneralQuery = (tenantId: string | null) =>
	useQuery({
		queryKey: ['tenant', ...TENANT_SETTINGS_GENERAL_QUERY_KEY, tenantId],
		queryFn: () => {
			if (!tenantId) {
				throw new Error(
					'tenantId is required for tenant settings general query',
				);
			}

			return fetchTenantSettingsGeneral(tenantId);
		},
		enabled: tenantId !== null,
	});

export const useUpdateTenantSettingsGeneralMutation = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: ['tenant', ...TENANT_SETTINGS_GENERAL_QUERY_KEY, 'update'],
		mutationFn: updateTenantSettingsGeneral,
		onSuccess: (_data, variables) => {
			void queryClient.invalidateQueries({
				queryKey: [
					'tenant',
					...TENANT_SETTINGS_GENERAL_QUERY_KEY,
					variables.tenantId,
				],
			});
		},
	});
};

export const invalidateTenantSettingsGeneralQuery = async (
	queryClient: QueryClient,
	tenantId: string,
): Promise<void> => {
	await queryClient.invalidateQueries({
		queryKey: ['tenant', ...TENANT_SETTINGS_GENERAL_QUERY_KEY, tenantId],
	});
};
