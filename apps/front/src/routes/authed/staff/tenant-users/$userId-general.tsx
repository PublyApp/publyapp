import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	invalidateGlobalTenantUsers,
	toGlobalTenantUserDetails,
	useGlobalTenantUserDetailsQuery,
	useUpdateGlobalTenantUserIdentityMutation,
} from '~/lib/query/staff-global-tenant-users';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { tenantUserDetailsCrumbs } from './_crumbs';
import { TenantUserDetailsShell } from './_details-shell';

const getIdentitySchema = (t: (key: string) => string) =>
	z.object({
		firstName: z
			.string()
			.trim()
			.max(100, { message: t('firstname-too-long') }),
		lastName: z
			.string()
			.trim()
			.max(100, { message: t('lastname-too-long') }),
	});

type IdentityFormValues = z.infer<ReturnType<typeof getIdentitySchema>>;

const TenantUserGeneralTabPage = () => {
	const { userId } = Route.useParams();

	return (
		<TenantUserDetailsShell userId={userId} activeTab="general">
			<IdentityEditSection userId={userId} />
		</TenantUserDetailsShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenant-users/details/$userId/general',
)({
	staticData: {
		i18nNamespaces: ['common'],
		crumbs: tenantUserDetailsCrumbs,
	},
	component: TenantUserGeneralTabPage,
});

const IdentityEditSection = ({ userId }: { userId: string }) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const updateIdentity = useUpdateGlobalTenantUserIdentityMutation();
	const [shouldLogout, setShouldLogout] = useState(false);
	// Saved-flag as STATE (not a ref): `useBlocker`'s shouldBlockFn runs while
	// the component renders, and react-doctor forbids ref reads there. The
	// flag flips only on a successful submit, so the extra render it causes
	// is harmless.
	const [hasSaved, setHasSaved] = useState(false);

	const schema = useMemo(() => getIdentitySchema(t), [t]);
	const methods = useForm<IdentityFormValues>({
		resolver: zodResolver(schema),
		defaultValues: { firstName: '', lastName: '' },
	});
	const { formState, reset, setError } = methods;

	// Same key as the shell's query — served from cache, no second request.
	const detailsQuery = useGlobalTenantUserDetailsQuery({ userId });
	const user = useMemo(
		() => toGlobalTenantUserDetails(detailsQuery.data),
		[detailsQuery.data],
	);

	// Hydrate once per user, never over an in-progress edit.
	const hydratedUserIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!user || !detailsQuery.isSuccess) {
			return;
		}

		if (hydratedUserIdRef.current === userId && formState.isDirty) {
			return;
		}

		reset({ firstName: user.firstName ?? '', lastName: user.lastName ?? '' });
		hydratedUserIdRef.current = userId;
	}, [user, userId, detailsQuery.isSuccess, formState.isDirty, reset]);

	const blocker = useBlocker({
		shouldBlockFn: () => formState.isDirty && !hasSaved,
		withResolver: true,
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const onSubmit = methods.handleSubmit(async (values) => {
		setError('root', {});

		try {
			await updateIdentity.mutateAsync({
				userId,
				firstName: values.firstName.trim(),
				lastName: values.lastName.trim(),
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				let mappedToField = false;
				for (const field of ['firstName', 'lastName'] as const) {
					const message = failure.fieldErrors[field]?.[0];
					if (message) {
						setError(field, { message });
						mappedToField = true;
					}
				}
				if (!mappedToField) {
					setError('root', {
						message: getFailureMessage(failure, {
							fallback: t('an-error-occurred'),
						}),
					});
				}
				return;
			}

			await displayLocalMutationFailure(error, t('an-error-occurred'));
			return;
		}

		setHasSaved(true);
		methods.reset(
			{ firstName: values.firstName.trim(), lastName: values.lastName.trim() },
			{ keepValues: true },
		);

		try {
			await invalidateGlobalTenantUsers(queryClient);
		} catch (invalidationError) {
			logger.warn('Global tenant-user invalidation failed', invalidationError);
		}

		toastLocalMutationResult.success(t('tenant-user-updated-success'));
	});

	return (
		<FormPageLayout data-testid="tenant-user-general-tab">
			<Form methods={methods} onSubmit={onSubmit}>
				<div className="rounded-[var(--publy-radius-card)] border border-[var(--publy-row-border)] bg-[var(--publy-surface-raised)] p-5">
					<h2 className="text-sm font-medium text-foreground">
						{t('metadata')}
					</h2>
					<div className="mt-4 grid gap-4 sm:grid-cols-2">
						<Field.Text
							name="firstName"
							label={t('firstname')}
							isDisabled={updateIdentity.isPending}
						/>
						<Field.Text
							name="lastName"
							label={t('lastname')}
							isDisabled={updateIdentity.isPending}
						/>
					</div>
					<p className="mt-4 text-[13px] text-muted-foreground">
						{t('email-address')}: {user?.email ?? ''}
					</p>
				</div>

				<FormActionBar>
					<Button type="submit" disabled={updateIdentity.isPending}>
						{t('save-changes')}
					</Button>
				</FormActionBar>
			</Form>
			<ConfirmDialog
				isOpen={blocker.status === 'blocked'}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				cancelLabel={t('cancel')}
				tone="danger"
				onConfirm={() => blocker.proceed?.()}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						blocker.reset?.();
					}
				}}
			/>
		</FormPageLayout>
	);
};
