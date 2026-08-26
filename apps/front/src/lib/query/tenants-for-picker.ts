import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getClientManager } from '~/lib/api-client/client-manager';
import { readSelectedTenantId } from '~/lib/selected-tenant-storage';

import type { GetUserTenantsForPickerResponse } from '@org/client-ts/models/index';
import { TENANT_STATUS_ENUM } from '@org/shared-ts/lib/constants';

export type TenantForPickerRow = {
	id: string;
	name: string | null;
	code: string | null;
	status: string | null;
};

export type TenantsForPickerData = {
	tenants: TenantForPickerRow[];
	activeCount: number;
	totalCount: number;
	hasSuspendedTenants: boolean;
};

/** @internal Unscoped — build an invalidation/removal key from this via
 * `scopedKey()` rather than hand-assembling a prefixed array at a call
 * site. */
const TENANTS_FOR_PICKER_QUERY_KEY = ['tenants-for-picker'] as const;

export const isActiveTenantForPicker = (
	tenant: Pick<TenantForPickerRow, 'status'>,
): boolean => tenant.status === TENANT_STATUS_ENUM.ACTIVE;

export const isSuspendedTenantForPicker = (
	tenant: Pick<TenantForPickerRow, 'status'>,
): boolean => tenant.status === TENANT_STATUS_ENUM.SUSPENDED;

/**
 * Resolves the workspace tenant, mirroring the tenant portal shell
 * (`routes/authed/tenant.tsx`): `selectedTenantId` wins when it names an
 * ACTIVE tenant in the user's list; otherwise exactly one ACTIVE tenant
 * auto-resolves. A suspended sibling never forces a different pick.
 */
export const resolveWorkspaceTenant = (
	data: TenantsForPickerData,
	selectedTenantId: string | null,
): TenantForPickerRow | undefined => {
	if (selectedTenantId) {
		const selected = data.tenants.find(
			(tenant) =>
				tenant.id === selectedTenantId && isActiveTenantForPicker(tenant),
		);
		if (selected) {
			return selected;
		}
	}

	if (data.activeCount === 1) {
		return data.tenants.find(isActiveTenantForPicker);
	}

	return undefined;
};

/**
 * The tenant-scoped callers (e.g. the account profile page) need the resolved
 * workspace tenant id to build a tenant-scoped API client. The shell already
 * resolved it before navigating here, so this re-derives the same tenant from
 * the (cached) picker query + the persisted selection.
 */
export const useResolvedWorkspaceTenantId = (): string | null => {
	const query = useTenantsForPickerQuery();
	const [selectedTenantId] = useState<string | null>(() =>
		readSelectedTenantId(),
	);

	const resolvedTenant = query.isSuccess
		? resolveWorkspaceTenant(query.data, selectedTenantId)
		: undefined;

	return resolvedTenant?.id ?? null;
};

const normalizeString = (value: string | null | undefined): string | null => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

export const toTenantsForPickerData = (
	result: GetUserTenantsForPickerResponse | null | undefined,
): TenantsForPickerData => {
	const rows: TenantForPickerRow[] = [];

	for (const item of result?.tenants ?? []) {
		const id = normalizeString(item.id?.toString() ?? undefined);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			name: normalizeString(item.name),
			code: normalizeString(item.code),
			status: normalizeString(item.status),
		});
	}

	return {
		tenants: rows,
		activeCount: result?.activeCount ?? 0,
		totalCount: result?.totalCount ?? 0,
		hasSuspendedTenants: result?.hasSuspendedTenants ?? false,
	};
};

export const useTenantsForPickerQuery = () =>
	useQuery({
		queryKey: [...TENANTS_FOR_PICKER_QUERY_KEY],
		queryFn: async () => {
			const client = getClientManager().getOrCreateTenantScopeClient();
			const result = await client.auth.tenantsForPicker.get();
			return toTenantsForPickerData(result);
		},
	});
