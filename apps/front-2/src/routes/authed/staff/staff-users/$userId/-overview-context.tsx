import { createContext, useContext } from 'react';
import type {
	AssignedStaffProfile,
	StaffUserDetails,
} from '~/lib/query/staff-users';

export type StaffUserOverviewContextValue = {
	user: StaffUserDetails;
	locale: string;
	profiles: AssignedStaffProfile[];
	profilesHasError: boolean;
	maxProfilesPerUser: number;
	canSuspend: boolean;
	canReactivate: boolean;
	suspendLabel: 'Suspend' | 'Reactivate';
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
