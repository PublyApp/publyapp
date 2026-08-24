import type { QueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import { invalidateStaffUsers } from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import type { StaffUserEditValues } from './_edit-schema';

type IdentityUpdateInput = {
	userId: string;
	firstName?: string | null;
	lastName?: string | null;
	avatarUrl?: string | null;
	accountLevel?: StaffUserEditValues['accountLevel'];
};

type DirtyFields = Record<string, boolean | boolean[] | undefined>;

const buildIdentityUpdateInput = (
	userId: string,
	values: StaffUserEditValues,
	dirtyFields: DirtyFields,
): IdentityUpdateInput => {
	const input: IdentityUpdateInput = { userId };
	if (dirtyFields.firstName) {
		input.firstName = values.firstName?.trim() || null;
	}
	if (dirtyFields.lastName) {
		input.lastName = values.lastName?.trim() || null;
	}
	if (dirtyFields.avatarUrl) {
		input.avatarUrl = values.avatarUrl.trim() || null;
	}
	if (dirtyFields.accountLevel) {
		input.accountLevel = values.accountLevel;
	}
	return input;
};

const commitIdentityFields = (
	methods: UseFormReturn<StaffUserEditValues>,
	values: StaffUserEditValues,
	dirtyFields: DirtyFields,
): void => {
	for (const field of [
		'firstName',
		'lastName',
		'avatarUrl',
		'accountLevel',
	] as const) {
		if (dirtyFields[field]) {
			methods.resetField(field, { defaultValue: values[field] });
		}
	}
};

export const submitStaffUserEdit = async ({
	userId,
	values,
	dirtyFields,
	methods,
	updateStaffUserAsync,
	updateStaffUserProfilesAsync,
	queryClient,
	setShouldLogout,
	setServerError,
	hasSavedRef,
	navigate,
	t,
}: {
	userId: string;
	values: StaffUserEditValues;
	dirtyFields: DirtyFields;
	methods: UseFormReturn<StaffUserEditValues>;
	updateStaffUserAsync: (input: IdentityUpdateInput) => Promise<unknown>;
	updateStaffUserProfilesAsync: (input: {
		userId: string;
		profileIds: string[];
	}) => Promise<unknown>;
	queryClient: QueryClient;
	setShouldLogout: (v: boolean) => void;
	setServerError: (v: string) => void;
	hasSavedRef: { current: boolean };
	navigate: (opts: { to: string; params: Record<string, string> }) => void;
	t: (key: string, opts?: Record<string, unknown>) => string;
}): Promise<void> => {
	const updateInput = buildIdentityUpdateInput(userId, values, dirtyFields);
	const hasIdentityChanges = Object.keys(updateInput).length > 1;
	const hasProfileChanges = Boolean(dirtyFields.profileIds);

	setServerError('');

	if (hasIdentityChanges) {
		try {
			await updateStaffUserAsync(updateInput);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			await displayLocalMutationFailure(error, t('unknown-error'));
			return;
		}

		commitIdentityFields(methods, values, dirtyFields);
		await invalidateStaffUsers(queryClient);
	}

	if (hasProfileChanges) {
		try {
			await updateStaffUserProfilesAsync({
				userId,
				profileIds: values.profileIds,
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			if (hasIdentityChanges) {
				const partialFailureMessage = t(
					'staff-user-identity-saved-profiles-failed',
					{
						reason: getFailureMessage(toApiFailure(error), {
							fallback: t('unknown-error'),
						}),
					},
				);
				setServerError(partialFailureMessage);
				toastLocalMutationResult.error(partialFailureMessage);
			} else {
				await displayLocalMutationFailure(error, t('unknown-error'));
			}
			return;
		}

		await invalidateStaffUsers(queryClient);
	}

	hasSavedRef.current = true;
	toastLocalMutationResult.success(t('staff-user-updated-success'));
	navigate({
		to: '/staff/staff-users/$userId',
		params: { userId },
	});
};

export const computeActionBarStatus = (
	isDirty: boolean,
	attentionCount: number,
	t: (key: string, opts?: Record<string, unknown>) => string,
): string | undefined => {
	if (!isDirty) {
		return undefined;
	}

	if (attentionCount > 0) {
		return `${t('common:unsaved-changes')} · ${t('fields-need-attention', { count: attentionCount })}`;
	}

	return t('common:unsaved-changes');
};
