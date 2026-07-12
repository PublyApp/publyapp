import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { GetUserTenantsForPickerResponse } from '@org/client-ts/src/models/index.js';
import { TENANT_STATUS_ENUM } from '@org/shared-ts/lib/constants';

export type TenantForPickerRow = {
	id: string;
	name: string;
	code: string | null;
	status: string | null;
};

export type TenantsForPickerData = {
	tenants: TenantForPickerRow[];
	activeCount: number;
	totalCount: number;
	hasSuspendedTenants: boolean;
};

export const TENANTS_FOR_PICKER_QUERY_KEY = ['tenants-for-picker'] as const;

export const isActiveTenantForPicker = (
	tenant: Pick<TenantForPickerRow, 'status'>,
): boolean => tenant.status === TENANT_STATUS_ENUM.ACTIVE;

export const isSuspendedTenantForPicker = (
	tenant: Pick<TenantForPickerRow, 'status'>,
): boolean => tenant.status === TENANT_STATUS_ENUM.SUSPENDED;

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
			name: normalizeString(item.name) ?? '—',
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
