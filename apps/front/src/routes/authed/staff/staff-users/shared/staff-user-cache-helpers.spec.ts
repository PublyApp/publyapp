import assert from 'node:assert/strict';
import test from 'node:test';

import {
	getDeletedStaffUserQueryRemovals,
	getStaffUserLifecycleInvalidationCalls,
} from './staff-user-cache-helpers.impl.ts';

const queryKeys = {
	findStaffProfiles: ['staff-profiles'],
	findStaffProfileUsers: ['staff-profile-users'],
	findStaffUser: ['staff-users'],
	getStaffUserById: (userId: string) => ['staff-user', userId],
	getStaffUserProfiles: (userId: string) => ['staff-user-profiles', userId],
	getVerificationLink: (userId: string) => ['verification-link', userId],
};

test('getStaffUserLifecycleInvalidationCalls refreshes cross-view caches for membership changes', () => {
	const invalidationCalls = getStaffUserLifecycleInvalidationCalls({
		queryKeys,
		userIds: ['user-1', 'user-2', 'user-1', ''],
		invalidateStaffProfilesList: true,
		invalidateStaffUserProfiles: true,
	});

	assert.deepEqual(invalidationCalls, [
		{ queryKey: ['staff-users'] },
		{ queryKey: ['staff-profile-users'] },
		{ queryKey: ['staff-user', 'user-1'] },
		{ queryKey: ['staff-user', 'user-2'] },
		{ queryKey: ['staff-user-profiles', 'user-1'] },
		{ queryKey: ['staff-user-profiles', 'user-2'] },
		{ queryKey: ['staff-profiles'] },
	]);
});

test('getDeletedStaffUserQueryRemovals removes deleted-user caches once per unique user', () => {
	const removedQueryKeys = getDeletedStaffUserQueryRemovals({
		queryKeys,
		userIds: ['user-1', 'user-1', '', 'user-2'],
	});

	assert.deepEqual(removedQueryKeys, [
		{ queryKey: ['staff-user', 'user-1'] },
		{ queryKey: ['staff-user-profiles', 'user-1'] },
		{ queryKey: ['verification-link', 'user-1'] },
		{ queryKey: ['staff-user', 'user-2'] },
		{ queryKey: ['staff-user-profiles', 'user-2'] },
		{ queryKey: ['verification-link', 'user-2'] },
	]);
});
