import type { QueryClient } from '@tanstack/react-query';

import { useGetVerificationLink } from '#app/lib/react-query/features/common/auth.hooks.ts';
import {
	useFindStaffProfiles,
	useFindStaffProfileUsers,
} from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import {
	useFindStaffUser,
	useGetStaffUserById,
	useGetStaffUserProfiles,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';
import {
	getDeletedStaffUserQueryRemovals,
	getStaffUserLifecycleInvalidationCalls,
} from './staff-user-cache-helpers.impl.ts';

const getStaffUserLifecycleQueryKeys = () => {
	return {
		findStaffProfiles: useFindStaffProfiles.getKey(),
		findStaffProfileUsers: useFindStaffProfileUsers.getKey(),
		findStaffUser: useFindStaffUser.getKey(),
		getStaffUserById: (userId: string) =>
			useGetStaffUserById.getKey({ userId }),
		getStaffUserProfiles: (userId: string) =>
			useGetStaffUserProfiles.getKey({ userId }),
		getVerificationLink: (userId: string) =>
			useGetVerificationLink.getKey({ userId }),
	};
};

export const invalidateStaffUserLifecycleQueries = async ({
	queryClient,
	userIds,
	invalidateStaffProfilesList = false,
	invalidateStaffUserProfiles = false,
}: {
	queryClient: QueryClient;
	userIds: readonly string[];
	invalidateStaffProfilesList?: boolean;
	invalidateStaffUserProfiles?: boolean;
}) => {
	const invalidations = getStaffUserLifecycleInvalidationCalls({
		queryKeys: getStaffUserLifecycleQueryKeys(),
		userIds,
		invalidateStaffProfilesList,
		invalidateStaffUserProfiles,
	}).map(({ queryKey }) => {
		return queryClient.invalidateQueries({ queryKey });
	});

	await Promise.all(invalidations);
};

export const clearDeletedStaffUserRelatedQueries = ({
	queryClient,
	userIds,
}: {
	queryClient: QueryClient;
	userIds: readonly string[];
}) => {
	for (const { queryKey } of getDeletedStaffUserQueryRemovals({
		queryKeys: getStaffUserLifecycleQueryKeys(),
		userIds,
	})) {
		queryClient.removeQueries({
			queryKey,
		});
	}
};
