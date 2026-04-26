type AppQueryKey = readonly unknown[] | undefined;

type StaffUserLifecycleQueryKeys = {
	findStaffProfiles: AppQueryKey;
	findStaffProfileUsers: AppQueryKey;
	findStaffUser: AppQueryKey;
	getStaffUserById: (userId: string) => AppQueryKey;
	getStaffUserProfiles: (userId: string) => AppQueryKey;
	getVerificationLink: (userId: string) => AppQueryKey;
};

type StaffUserLifecycleQueryOptions = {
	userIds: readonly string[];
	invalidateStaffProfilesList?: boolean;
	invalidateStaffUserProfiles?: boolean;
};

type QueryCall = {
	queryKey: AppQueryKey;
};

const getUniqueTruthyIds = (userIds: readonly string[]) => {
	const uniqueIds = new Set<string>();

	for (const userId of userIds) {
		if (!userId) {
			continue;
		}

		uniqueIds.add(userId);
	}

	return Array.from(uniqueIds);
};

export const getStaffUserLifecycleInvalidationCalls = ({
	queryKeys,
	userIds,
	invalidateStaffProfilesList = false,
	invalidateStaffUserProfiles = false,
}: StaffUserLifecycleQueryOptions & {
	queryKeys: StaffUserLifecycleQueryKeys;
}) => {
	const uniqueUserIds = getUniqueTruthyIds(userIds);
	const invalidationCalls: QueryCall[] = [
		{ queryKey: queryKeys.findStaffUser },
		{ queryKey: queryKeys.findStaffProfileUsers },
		...uniqueUserIds.map((userId) => {
			return {
				queryKey: queryKeys.getStaffUserById(userId),
			};
		}),
	];

	if (invalidateStaffUserProfiles) {
		invalidationCalls.push(
			...uniqueUserIds.map((userId) => {
				return {
					queryKey: queryKeys.getStaffUserProfiles(userId),
				};
			}),
		);
	}

	if (invalidateStaffProfilesList) {
		invalidationCalls.push({
			queryKey: queryKeys.findStaffProfiles,
		});
	}

	return invalidationCalls;
};

export const getDeletedStaffUserQueryRemovals = ({
	queryKeys,
	userIds,
}: {
	queryKeys: StaffUserLifecycleQueryKeys;
	userIds: readonly string[];
}) => {
	const uniqueUserIds = getUniqueTruthyIds(userIds);

	return uniqueUserIds.flatMap((userId) => {
		return [
			{
				queryKey: queryKeys.getStaffUserProfiles(userId),
			},
			{
				queryKey: queryKeys.getVerificationLink(userId),
			},
		];
	});
};
