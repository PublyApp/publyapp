import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field, Form, FormActionBar } from '~/components/field';
import { Button } from '~/components/ui/button';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-feedback/mutation-toast';
import {
	invalidateGlobalTenantUsers,
	useUpdateGlobalTenantUserIdentityMutation,
} from '~/lib/query/staff-global-tenant-users';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

export type IdentityFormValues = { firstName: string; lastName: string };
type Methods = UseFormReturn<IdentityFormValues>;
type Failure = ReturnType<typeof toApiFailure>;

const IDENTITY_FIELDS = ['firstName', 'lastName'] as const;

/** Maps server validation errors onto the fields; falls back to a root error. */
const applyValidationFailure = (
	failure: Extract<Failure, { kind: 'validation' }>,
	setError: Methods['setError'],
	fallback: string,
) => {
	let mappedToField = false;
	for (const field of IDENTITY_FIELDS) {
		const message = failure.fieldErrors[field]?.[0];
		if (message) {
			setError(field, { message });
			mappedToField = true;
		}
	}
	if (!mappedToField) {
		setError('root', { message: getFailureMessage(failure, { fallback }) });
	}
};

/** Hydrate once per user, never over an in-progress edit. */
export const useHydrateIdentity = ({
	methods,
	userId,
	user,
	isSuccess,
}: {
	methods: Methods;
	userId: string;
	user: { firstName: string | null; lastName: string | null } | null;
	isSuccess: boolean;
}) => {
	const { reset, formState } = methods;
	const hydratedUserIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!user || !isSuccess) {
			return;
		}

		if (hydratedUserIdRef.current === userId && formState.isDirty) {
			return;
		}

		reset({ firstName: user.firstName ?? '', lastName: user.lastName ?? '' });
		hydratedUserIdRef.current = userId;
	}, [user, userId, isSuccess, formState.isDirty, reset]);
};

export const useIdentitySubmit = (methods: Methods, userId: string) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const updateIdentity = useUpdateGlobalTenantUserIdentityMutation();
	const [shouldLogout, setShouldLogout] = useState(false);
	// Saved-flag as STATE (not a ref): `useBlocker`'s shouldBlockFn runs while
	// the component renders, and react-doctor forbids ref reads there. The
	// flag flips only on a successful submit, so the extra render it causes
	// is harmless.
	const [hasSaved, setHasSaved] = useState(false);

	const handleFailure = async (error: unknown) => {
		if (shouldLogoutForFailure(error)) {
			setShouldLogout(true);
			return;
		}

		const failure = toApiFailure(error);
		if (failure.kind === 'validation') {
			applyValidationFailure(failure, methods.setError, t('an-error-occurred'));
			return;
		}

		await displayLocalMutationFailure(error, t('an-error-occurred'));
	};

	const onSubmit = methods.handleSubmit(async (values) => {
		methods.setError('root', {});
		const firstName = values.firstName.trim();
		const lastName = values.lastName.trim();

		try {
			await updateIdentity.mutateAsync({ userId, firstName, lastName });
		} catch (error) {
			await handleFailure(error);
			return;
		}

		setHasSaved(true);
		methods.reset({ firstName, lastName }, { keepValues: true });

		try {
			await invalidateGlobalTenantUsers(queryClient);
		} catch (invalidationError) {
			logger.warn('Global tenant-user invalidation failed', invalidationError);
		}

		toastLocalMutationResult.success(t('tenant-user-updated-success'));
	});

	return {
		onSubmit,
		hasSaved,
		shouldLogout,
		isPending: updateIdentity.isPending,
	};
};

export const IdentityForm = ({
	methods,
	onSubmit,
	isPending,
	email,
}: {
	methods: Methods;
	onSubmit: () => void;
	isPending: boolean;
	email: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<Form methods={methods} onSubmit={onSubmit}>
			<div className="rounded-[var(--publy-radius-card)] border border-[var(--publy-row-border)] bg-[var(--publy-surface-raised)] p-5">
				<h2 className="text-sm font-medium text-foreground">{t('metadata')}</h2>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<Field.Text
						name="firstName"
						label={t('firstname')}
						isDisabled={isPending}
					/>
					<Field.Text
						name="lastName"
						label={t('lastname')}
						isDisabled={isPending}
					/>
				</div>
				<p className="mt-4 text-[13px] text-muted-foreground">
					{t('email-address')}: {email}
				</p>
			</div>

			<FormActionBar>
				<Button type="submit" disabled={isPending}>
					{t('save-changes')}
				</Button>
			</FormActionBar>
		</Form>
	);
};
