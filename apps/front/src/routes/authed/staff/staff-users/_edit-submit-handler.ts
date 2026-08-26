import type { QueryClient } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import { invalidateStaffUsers } from '~/lib/query/staff-users';

import type { GetStaffUserByIdResult } from '@org/client-ts/models/index';
import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { recordLastSavedStaffUserEditValues } from './_edit-nav-guard';
import type { StaffUserEditValues } from './_edit-schema';

type IdentityUpdateInput = {
	userId: string;
	firstName?: string | null;
	lastName?: string | null;
	avatarUrl?: string | null;
	accountLevel?: StaffUserEditValues['accountLevel'];
};

// RHF 7.85 marks array-valued dirty flags as (boolean | undefined)[] (7.54 used
// boolean[]); the readonly element union accepts both shapes without loosening
// any consumer — every reader here only tests truthiness.
type DirtyFields = Record<
	string,
	boolean | ReadonlyArray<boolean | undefined> | undefined
>;

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

/** Outcome the page must act on. The handler never navigates itself:
 * `react-doctor/tanstack-start-no-navigate-in-render` flags router calls in
 * non-component modules, and navigation belongs at the call site anyway.
 * `'stay'`: nothing to navigate from (failure paths keep the form open). */
export type SubmitStaffUserEditOutcome = 'navigate' | 'stay';

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
	t,
}: {
	userId: string;
	values: StaffUserEditValues;
	dirtyFields: DirtyFields;
	methods: UseFormReturn<StaffUserEditValues>;
	updateStaffUserAsync: (
		input: IdentityUpdateInput,
	) => Promise<GetStaffUserByIdResult | undefined>;
	updateStaffUserProfilesAsync: (input: {
		userId: string;
		profileIds: string[];
	}) => Promise<GetStaffUserByIdResult | undefined>;
	queryClient: QueryClient;
	setShouldLogout: (v: boolean) => void;
	setServerError: (v: string) => void;
	t: (key: string, opts?: Record<string, unknown>) => string;
}): Promise<SubmitStaffUserEditOutcome> => {
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
				return 'stay';
			}

			await displayLocalMutationFailure(error, t('staff-users:unknown-error'));
			return 'stay';
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
				return 'stay';
			}

			if (hasIdentityChanges) {
				const partialFailureMessage = t(
					'staff-users:staff-user-identity-saved-profiles-failed',
					{
						reason: getFailureMessage(toApiFailure(error), {
							fallback: t('staff-users:unknown-error'),
						}),
					},
				);
				setServerError(partialFailureMessage);
				toastLocalMutationResult.error(partialFailureMessage);
			} else {
				await displayLocalMutationFailure(
					error,
					t('staff-users:unknown-error'),
				);
			}
			return 'stay';
		}

		await invalidateStaffUsers(queryClient);
	}

	// The save snapshot replaces the pristine baseline as the guard's truth:
	// written outside render so every stacked blocker closure reads it live
	// during the post-save redirect (#1314-r1 MAJOR).
	recordLastSavedStaffUserEditValues(userId, values);
	toastLocalMutationResult.success(t('staff-users:staff-user-updated-success'));

	return 'navigate';
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
		return `${t('common:unsaved-changes')} · ${t('staff-users:fields-need-attention', { count: attentionCount })}`;
	}

	return t('common:unsaved-changes');
};
