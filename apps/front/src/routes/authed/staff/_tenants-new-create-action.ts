import { type QueryClient } from '@tanstack/react-query';
import { type UseFormReturn } from 'react-hook-form';
import {
	invalidateStaffTenants,
	type CreateStaffTenantInput,
} from '~/lib/query/staff-tenants';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { type TranslateFn } from './_tenant-form-shared';
import {
	buildCreateTenantInput,
	planCreateTenantFieldErrors,
} from './_tenants-new-submit';
import { type TenantCreateFormValues } from './_tenants-new-types';
import { type ImportedMember } from './tenants-new-helpers';

type CreateResult = { id?: { toString: () => string } | null } | undefined;

/** `failed` covers both a mapped 422 (the messages are already on the form)
 * and any other error the mutation's own toast owns. */
export type TenantCreateOutcome =
	| { kind: 'created'; tenantId: string | undefined }
	| { kind: 'logout' }
	| { kind: 'failed' };

/** Runs the create mutation and maps an RFC 7807 validation failure back onto
 * the form. Navigation stays with the caller so this never touches routing.
 */
export const buildTenantCreateSubmitter = ({
	methods,
	t,
	queryClient,
	mutateAsync,
	parsedMembers,
}: {
	methods: UseFormReturn<TenantCreateFormValues>;
	t: TranslateFn;
	queryClient: QueryClient;
	mutateAsync: (input: CreateStaffTenantInput) => Promise<CreateResult>;
	parsedMembers: ImportedMember[];
}) => {
	const applyValidationFailure = (error: unknown) => {
		const failure = toApiFailure(error);
		if (failure.kind !== 'validation') {
			return;
		}

		const plan = planCreateTenantFieldErrors(
			failure.fieldErrors,
			getFailureMessage(failure, { fallback: t('tenant-create-failed') }),
		);
		for (const fieldError of plan.fieldErrors) {
			methods.setError(fieldError.field, {
				type: 'server',
				message: fieldError.message,
			});
		}
		if (plan.rootMessage !== null) {
			methods.setError('root.server', {
				type: 'server',
				message: plan.rootMessage,
			});
		}
	};

	return async (
		values: TenantCreateFormValues,
	): Promise<TenantCreateOutcome> => {
		let result: CreateResult;
		try {
			result = await mutateAsync(
				buildCreateTenantInput({ values, parsedMembers }),
			);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				return { kind: 'logout' };
			}

			applyValidationFailure(error);
			return { kind: 'failed' };
		}

		await invalidateStaffTenants(queryClient);

		return { kind: 'created', tenantId: result?.id?.toString().trim() };
	};
};
