import type { UseFormSetError } from 'react-hook-form';

import { getFailureMessage } from '@org/shared-ts/lib/api-failure/to-api-failure';
import type { ApiFailure } from '@org/shared-ts/lib/api-failure/types';

import type { TenantUserEditValues } from './_edit-schema';

/**
 * Maps an update failure onto the form: a validation failure whose only field
 * error is `avatarUrl` becomes a field-level error, anything else (or an
 * additional unmapped field) also surfaces as the form-level root message.
 */
export const applyTenantUserUpdateFailure = ({
	failure,
	fallback,
	setError,
	setRootValidationError,
}: {
	failure: ApiFailure;
	fallback: string;
	setError: UseFormSetError<TenantUserEditValues>;
	setRootValidationError: (message: string) => void;
}): void => {
	if (failure.kind !== 'validation') {
		return;
	}

	const hasAvatarUrlError = (failure.fieldErrors.avatarUrl?.length ?? 0) > 0;
	if (hasAvatarUrlError) {
		setError('avatarUrl', {
			type: 'server',
			message: getFailureMessage(failure, { fallback }),
		});
	}

	const hasUnmappedError = Object.keys(failure.fieldErrors).some(
		(field) => field !== 'avatarUrl',
	);
	if (!hasAvatarUrlError || hasUnmappedError) {
		setRootValidationError(getFailureMessage(failure, { fallback }));
	}
};
