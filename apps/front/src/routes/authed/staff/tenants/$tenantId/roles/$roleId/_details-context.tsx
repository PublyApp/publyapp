import { createContext, useContext } from 'react';
import type {
	StaffTenantPermissionGroup,
	StaffTenantRoleDetails,
	StaffTenantRoleMemberRow,
} from '~/lib/query/staff-tenant-roles';

/**
 * What the `$roleId` layout route resolves once and every section child
 * renders from. The layout owns the role/tenant/permission queries, the
 * delete flow, the edit drawer and the navigation guard; the children own
 * only their own body.
 */
export type StaffTenantRoleDetailsContextValue = {
	tenantId: string;
	roleId: string;
	role: StaffTenantRoleDetails;
	permissionKeys: string[];
	/** Monotonic TanStack Query revision for the granted-key server result. */
	permissionKeysRevision: number;
	permissionGroups: StaffTenantPermissionGroup[];
	isCatalogPending: boolean;
	isCatalogError: boolean;
	catalogError: unknown;
	locale: string;
	/** Leading members for the Overview avatar stack / preview. */
	members: StaffTenantRoleMemberRow[];
	membersPending: boolean;
	membersError: boolean;
	isDeletePending: boolean;
	onDeleteRequest: () => void;
	onSessionExpired: () => void;
	/** Reports the inline permission matrix's staged-edit dirtiness up to the
	 * layout's navigation guard. */
	onPermissionsDirtyChange: (isDirty: boolean) => void;
};

export const StaffTenantRoleDetailsContext =
	createContext<StaffTenantRoleDetailsContextValue | null>(null);

export const useStaffTenantRoleDetailsContext =
	(): StaffTenantRoleDetailsContextValue => {
		const context = useContext(StaffTenantRoleDetailsContext);
		if (!context) {
			throw new Error(
				'useStaffTenantRoleDetailsContext must be used within the tenant role detail route',
			);
		}

		return context;
	};
