import { createContext, useContext } from 'react';
import type {
	AssignedStaffRole,
	StaffUserDetails,
} from '~/lib/query/staff-users';

export type StaffUserOverviewContextValue = {
	user: StaffUserDetails;
	locale: string;
	roles: AssignedStaffRole[];
	rolesIsPending: boolean;
	rolesHasError: boolean;
	onRetryRoles: () => void;
	maxRolesPerUser: number;
	canSuspend: boolean;
	canReactivate: boolean;
	suspendLabelKey: 'suspend' | 'reactivate';
	suspendDescription: string;
	isDeletePending: boolean;
	onOpenSuspendDialog: () => void;
	onOpenDeleteDialog: () => void;
};

export const StaffUserOverviewContext =
	createContext<StaffUserOverviewContextValue | null>(null);

export const useStaffUserOverviewContext =
	(): StaffUserOverviewContextValue => {
		const context = useContext(StaffUserOverviewContext);
		if (!context) {
			throw new Error(
				'useStaffUserOverviewContext must be used within the staff user detail route',
			);
		}

		return context;
	};
