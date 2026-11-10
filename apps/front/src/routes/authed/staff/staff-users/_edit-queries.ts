import { staffRolesQueryOptions } from '~/lib/query/staff-roles';
import {
	staffUserDetailsQueryOptions,
	staffUserRolesQueryOptions,
} from '~/lib/query/staff-users';

import { ROLE_PAGE_SIZE } from './_edit-schema';

/**
 * The edit page's three queries, declared once: the loader warms them and
 * `useEditFormData` reads the same variables. The role search the user types
 * and the role cursor live in React state, so the loader warms the first,
 * unfiltered page of the role list (decision 4).
 */
export const staffUserEditQueries = ({ userId }: { userId: string }) => ({
	details: {
		options: staffUserDetailsQueryOptions,
		variables: { userId },
	},
	userRoles: {
		options: staffUserRolesQueryOptions,
		variables: { userId },
	},
	roles: {
		options: staffRolesQueryOptions,
		variables: {
			limit: ROLE_PAGE_SIZE,
			sortId: 'name',
			sortOrder: 'asc' as const,
		},
	},
});
