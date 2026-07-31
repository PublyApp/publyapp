import { createContext, useContext } from 'react';
import type {
	StaffTenantPermissionGroup,
	StaffTenantProfileDetails,
	StaffTenantProfileMemberRow,
} from '~/lib/query/staff-tenant-profiles';

/**
 * What the `$profileId` layout route resolves once and every section child
 * renders from. The layout owns the profile/tenant/permission queries, the
 * delete flow, the edit drawer and the navigation guard; the children own
 * only their own body.
 */
export type StaffTenantProfileDetailsContextValue = {
	tenantId: string;
	profileId: string;
	profile: StaffTenantProfileDetails;
	permissionKeys: string[];
	/** Monotonic TanStack Query revision for the granted-key server result. */
	permissionKeysRevision: number;
	permissionGroups: StaffTenantPermissionGroup[];
	isCatalogPending: boolean;
	isCatalogError: boolean;
	catalogError: unknown;
	locale: string;
	/** Leading members for the Overview avatar stack / preview. */
	members: StaffTenantProfileMemberRow[];
	membersPending: boolean;
	membersError: boolean;
	isDeletePending: boolean;
	onDeleteRequest: () => void;
	onSessionExpired: () => void;
	/** Reports the inline permission matrix's staged-edit dirtiness up to the
	 * layout's navigation guard. */
	onPermissionsDirtyChange: (isDirty: boolean) => void;
};

export const StaffTenantProfileDetailsContext =
	createContext<StaffTenantProfileDetailsContextValue | null>(null);

export const useStaffTenantProfileDetailsContext =
	(): StaffTenantProfileDetailsContextValue => {
		const context = useContext(StaffTenantProfileDetailsContext);
		if (!context) {
			throw new Error(
				'useStaffTenantProfileDetailsContext must be used within the tenant profile detail route',
			);
		}

		return context;
	};
