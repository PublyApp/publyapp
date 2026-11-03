import {
	toStaffTenantRows,
	useStaffTenantsQuery,
} from '~/lib/query/staff-tenants';

/**
 * Job rows carry only `tenantId`; the list has no organisation name. Resolve
 * it from the staff organisations list when that first page is the whole
 * collection (`nextCursor == null`). An incomplete list yields no map, and the
 * cell falls back to the raw id rather than inventing a name (#2286).
 */
export const useJobTenantNames = (): Map<string, string> | null => {
	const query = useStaffTenantsQuery({
		sortId: 'created_at',
		sortOrder: 'desc',
		size: 100,
	});

	if (!query.data || query.data.nextCursor != null) {
		return null;
	}

	const names = new Map<string, string>();
	for (const tenant of toStaffTenantRows(query.data.data)) {
		names.set(tenant.id, tenant.name);
	}
	return names;
};
