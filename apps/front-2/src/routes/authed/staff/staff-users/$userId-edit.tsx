import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import { Button, buttonVariants } from '~/components/ui/button';
import {
	toStaffProfileRows,
	useStaffProfilesQuery,
} from '~/lib/query/staff-profiles';
import {
	invalidateStaffUsers,
	toAssignedStaffProfiles,
	toStaffUserDetails,
	useStaffUserDetailsQuery,
	useStaffUserProfilesQuery,
	useUpdateStaffUserMutation,
	useUpdateStaffUserProfilesMutation,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

const ACCOUNT_LEVEL_OPTIONS = ['Admin', 'User'] as const;
const STATUS_OPTIONS = ['Active', 'Suspended'] as const;

const ALLOWED_AVATAR_URL_PROTOCOLS = ['http:', 'https:'];

const getStaffUserEditSchema = (t: (key: string) => string) =>
	z.object({
		firstName: z.string().trim().max(128).optional(),
		lastName: z.string().trim().max(128).optional(),
		avatarUrl: z
			.string()
			.trim()
			.max(1024)
			.refine((value) => {
				if (!value) {
					return true;
				}

				try {
					return ALLOWED_AVATAR_URL_PROTOCOLS.includes(new URL(value).protocol);
				} catch {
					return false;
				}
			}, t('invalid-url')),
		email: z.string().trim().email().or(z.literal('')),
		accountLevel: z.enum(ACCOUNT_LEVEL_OPTIONS),
		status: z.enum(STATUS_OPTIONS),
		profileIds: z.array(z.string()),
	});

type StaffUserEditValues = z.infer<ReturnType<typeof getStaffUserEditSchema>>;

const normalizeAccountLevel = (
	value: string | null,
): StaffUserEditValues['accountLevel'] =>
	value === 'Admin' ? 'Admin' : 'User';

const normalizeStatus = (value: string | null): StaffUserEditValues['status'] =>
	value === 'Suspended' ? 'Suspended' : 'Active';

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const getFailureDescription = (error: unknown, fallback: string): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' && failure.detail) {
		return failure.detail;
	}

	return fallback;
};

const StaffUserEditLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center px-4 py-12"
			data-testid="staff-user-edit-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<span
					role="status"
					aria-label={t('loading')}
					className="size-4 animate-spin rounded-[var(--publy-radius-sm)] border-2 border-muted-foreground/30 border-t-foreground"
				/>
				<span>{t('loading-staff-user')}</span>
			</div>
		</div>
	);
};

const StaffUserEditError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('common');

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, 'malformed-id')
	) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title={t('staff-user-not-found-title')}
				description={getFailureDescription(
					error,
					t('staff-user-not-found-description'),
				)}
				testId="staff-user-edit-not-found"
				actions={
					<Link
						to="/staff/staff-users"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-users')}
					</Link>
				}
			/>
		);
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code="500 — Server Error"
			title={t('unable-to-load-staff-user')}
			description={t('problem-loading-staff-user-details')}
			testId="staff-user-edit-error"
			actions={
				<>
					<Button variant="default" onClick={onRetry} type="button">
						{t('try-again')}
					</Button>
					<Link
						to="/staff/staff-users"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-users')}
					</Link>
				</>
			}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/edit',
)({
	component: StaffUserEditPage,
});

function StaffUserEditPage() {
	const { userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');

	const detailsQuery = useStaffUserDetailsQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const assignedProfilesQuery = useStaffUserProfilesQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const profilesQuery = useStaffProfilesQuery({
		limit: 100,
		sortId: 'name',
		sortOrder: 'asc',
	});
	const updateStaffUser = useUpdateStaffUserMutation();
	const updateStaffUserProfiles = useUpdateStaffUserProfilesMutation();
	const user = useMemo(
		() => toStaffUserDetails(detailsQuery.data),
		[detailsQuery.data],
	);
	const assignedProfiles = useMemo(
		() => toAssignedStaffProfiles(assignedProfilesQuery.data),
		[assignedProfilesQuery.data],
	);
	const profileOptions = useMemo(
		() => toStaffProfileRows(profilesQuery.data?.data),
		[profilesQuery.data],
	);
	const staffUserEditSchema = useMemo(() => getStaffUserEditSchema(t), [t]);
	const methods = useForm<StaffUserEditValues>({
		resolver: zodResolver(staffUserEditSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			avatarUrl: '',
			email: '',
			accountLevel: 'User',
			status: 'Active',
			profileIds: [],
		},
	});
	const { formState, reset } = methods;
	const { errors, isSubmitting } = formState;
	// Tracks which userId the form currently holds hydrated data for. Comparing
	// against this (rather than diffing profileIds) guarantees the zero-profile
	// case still hydrates, and forces a fresh reset on a dirty userId transition
	// so a previous user's in-progress edits can never survive into the next one.
	const hydratedUserIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			!user ||
			!detailsQuery.isSuccess ||
			!assignedProfilesQuery.isSuccess ||
			assignedProfilesQuery.data === undefined
		) {
			return;
		}

		const isHydratedForCurrentUser = hydratedUserIdRef.current === userId;
		if (isHydratedForCurrentUser && formState.isDirty) {
			return;
		}

		reset({
			firstName: user.firstName ?? '',
			lastName: user.lastName ?? '',
			avatarUrl: user.avatarUrl ?? '',
			email: user.email,
			accountLevel: normalizeAccountLevel(user.accountLevel),
			status: normalizeStatus(user.status),
			profileIds: assignedProfiles.map((profile) => profile.id),
		});
		hydratedUserIdRef.current = userId;
	}, [
		assignedProfiles,
		formState.isDirty,
		reset,
		user,
		userId,
		detailsQuery.isSuccess,
		assignedProfilesQuery.isSuccess,
		assignedProfilesQuery.data,
	]);

	if (
		(detailsQuery.isError && shouldLogoutForFailure(detailsQuery.error)) ||
		(assignedProfilesQuery.isError &&
			shouldLogoutForFailure(assignedProfilesQuery.error)) ||
		(profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	if (
		detailsQuery.isPending ||
		assignedProfilesQuery.isPending ||
		profilesQuery.isPending
	) {
		return <StaffUserEditLoading />;
	}

	if (detailsQuery.isError) {
		return (
			<StaffUserEditError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	if (assignedProfilesQuery.isError) {
		return (
			<StaffUserEditError
				error={assignedProfilesQuery.error}
				onRetry={() => void assignedProfilesQuery.refetch()}
			/>
		);
	}

	if (profilesQuery.isError) {
		return (
			<StaffUserEditError
				error={profilesQuery.error}
				onRetry={() => void profilesQuery.refetch()}
			/>
		);
	}

	if (!user) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title={t('staff-user-not-found-title')}
				description={t('staff-user-payload-empty')}
				testId="staff-user-edit-not-found"
				actions={
					<Link
						to="/staff/staff-users"
						className={buttonVariants({ variant: 'outline' })}
					>
						{t('back-to-staff-users')}
					</Link>
				}
			/>
		);
	}

	const onSubmit = methods.handleSubmit(async (values) => {
		const updateInput = {
			userId,
			...(formState.dirtyFields.firstName
				? { firstName: values.firstName?.trim() || null }
				: {}),
			...(formState.dirtyFields.lastName
				? { lastName: values.lastName?.trim() || null }
				: {}),
			...(formState.dirtyFields.avatarUrl
				? { avatarUrl: values.avatarUrl.trim() || null }
				: {}),
			...(formState.dirtyFields.accountLevel
				? { accountLevel: values.accountLevel }
				: {}),
		};
		const hasIdentityChanges = Object.keys(updateInput).length > 1;
		const hasProfileChanges = Boolean(formState.dirtyFields.profileIds);

		try {
			setServerError('');
			if (hasIdentityChanges) {
				await updateStaffUser.mutateAsync(updateInput);
			}

			if (hasProfileChanges) {
				await updateStaffUserProfiles.mutateAsync({
					userId,
					profileIds: values.profileIds,
				});
			}

			// Invalidate once, after both mutations have fully succeeded — an
			// invalidation between them refetches `assignedProfiles`, which
			// re-runs the hydration effect and wipes the not-yet-saved profile
			// selection before the second mutation even attempts (r3-F8).
			if (hasIdentityChanges || hasProfileChanges) {
				await invalidateStaffUsers(queryClient);
			}

			void navigate({
				to: '/staff/staff-users/$userId',
				params: { userId },
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setServerError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('unknown-error'),
				}),
			);
		}
	});

	const isSubmittingForm =
		isSubmitting ||
		updateStaffUser.isPending ||
		updateStaffUserProfiles.isPending;
	const attentionCount = Object.keys(errors).length;
	const status = ((): string | undefined => {
		if (!formState.isDirty) {
			return undefined;
		}

		if (attentionCount > 0) {
			return `${t('unsaved-changes')} · ${t('fields-need-attention', { count: attentionCount })}`;
		}

		return t('unsaved-changes');
	})();

	return (
		<FormPageLayout data-testid="staff-user-edit-page">
			<div className="space-y-2">
				<Link
					to="/staff/staff-users/$userId"
					params={{ userId }}
					className="publy-back-link"
				>
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-user')}
				</Link>
				<div>
					<h1 className="text-xl font-semibold tracking-[-0.01em]">
						{t('edit-staff-user')}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{t('edit-staff-user-description')}
					</p>
				</div>
			</div>

			<Form methods={methods} onSubmit={onSubmit}>
				<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
					<div className="publy-card-header">
						<p className="publy-type-section-title">{t('identity')}</p>
					</div>
					<div className="grid gap-4 p-5 md:grid-cols-2">
						<Field.Text
							name="firstName"
							label={t('first-name')}
							placeholder={t('first-name')}
							isDisabled={isSubmittingForm}
						/>
						<Field.Text
							name="lastName"
							label={t('last-name')}
							placeholder={t('last-name')}
							isDisabled={isSubmittingForm}
						/>
						{/* TODO(contract): email updates use the separate email endpoint. */}
						<Field.Email
							name="email"
							label={t('email-address')}
							helperText={t('email-managed-separately')}
							isDisabled
						/>
						<Field.Text
							name="avatarUrl"
							label={t('avatar-url')}
							placeholder="https://example.com/avatar.png"
							isDisabled={isSubmittingForm}
						/>
					</div>
				</section>

				<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
					<div className="publy-card-header">
						<p className="publy-type-section-title">{t('access')}</p>
					</div>
					<div className="space-y-4 p-5">
						<div className="grid gap-4 md:grid-cols-2">
							<Field.Select
								name="accountLevel"
								label={t('role')}
								options={ACCOUNT_LEVEL_OPTIONS.map((value) => ({
									value,
									label: t(value === 'Admin' ? 'admin' : 'user'),
								}))}
								isDisabled={isSubmittingForm}
							/>
							{/* TODO(contract): status changes use suspend/reactivate endpoints. */}
							<Field.Select
								name="status"
								label={t('status')}
								helperText={t('status-managed-from-details')}
								options={STATUS_OPTIONS.map((value) => ({
									value,
									label: t(
										value === 'Active' ? 'status-active' : 'status-suspended',
									),
								}))}
								isDisabled
							/>
						</div>
						{profileOptions.length > 0 ? (
							<>
								<Field.CheckboxGroup
									name="profileIds"
									label={t('profiles')}
									options={profileOptions.map((profile) => ({
										value: profile.id,
										label: profile.name ?? t('unnamed-profile'),
										description: profile.description ?? undefined,
									}))}
									isDisabled={isSubmittingForm}
								/>
								{profilesQuery.data?.nextCursor ? (
									<p className="text-xs text-muted-foreground">
										{t('showing-first-n-profiles', {
											count: profileOptions.length,
										})}
									</p>
								) : null}
							</>
						) : (
							<p className="text-sm text-muted-foreground">
								{t('no-profiles-available')}
							</p>
						)}
					</div>
				</section>

				{serverError ? (
					<p className="text-sm text-destructive" role="alert">
						{serverError}
					</p>
				) : null}

				<FormActionBar status={status}>
					<Button
						type="button"
						variant="ghost"
						onClick={() => {
							void navigate({
								to: '/staff/staff-users/$userId',
								params: { userId },
							});
						}}
						disabled={isSubmittingForm}
					>
						{t('cancel')}
					</Button>
					<Button
						type="submit"
						disabled={isSubmittingForm || !formState.isDirty}
					>
						{t('save-changes')}
					</Button>
				</FormActionBar>
			</Form>
		</FormPageLayout>
	);
}
