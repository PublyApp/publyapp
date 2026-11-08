import { createContext, useContext } from 'react';
import type { QueryDisplayQuery } from '~/components/query-display';
import type { StaffUserDetails } from '~/lib/query/staff-users';

import type { GetStaffUserRolesResult } from '@org/client-ts/models/index';

export type StaffUserOverviewContextValue = {
	user: StaffUserDetails;
	locale: string;
	/** The assigned-roles query; the overview tab renders it through
	 * `QueryDisplay`. */
	query: QueryDisplayQuery<GetStaffUserRolesResult>;
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
