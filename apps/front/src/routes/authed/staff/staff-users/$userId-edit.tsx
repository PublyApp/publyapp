import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Field, Form, FormActionBar, FormPageLayout } from '~/components/field';
import { useCursorPagination } from '~/components/table/use-cursor-pagination';
import { Button, buttonVariants } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import { useStaffProfilesQuery } from '~/lib/query/staff-profiles';
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

import {
	buildStaffProfileOptions,
	collectSelectedProfileIds,
	rememberStaffProfileNames,
} from '../_staff-profile-options';
import { staffUserCrumbsBase } from './$userId/_crumbs';
import { ChangeStaffUserEmailDialog } from './_change-email-dialog';

const ACCOUNT_LEVEL_OPTIONS = ['Admin', 'User'] as const;
const STATUS_OPTIONS = ['Active', 'Suspended'] as const;

const ALLOWED_AVATAR_URL_PROTOCOLS = ['http:', 'https:'];
const PROFILE_PAGE_SIZE = 20;

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

/** What a successful save committed, tagged with the user it belongs to. */
type SavedStaffUserEditValues = StaffUserEditValues & { userId: string };

// #1314-r1: the nav guard must decide from values it can read LIVE at the
// moment a navigation runs. `history.block` stacks every registered closure
// and consults them ALL, so no render-frozen snapshot qualifies: a closure
// registered on an earlier render would read stale data exactly during the
// post-save redirect (the reviewed MAJOR). These module-level snapshots are
// written only outside render (hydration effect / submit handler) and read
// only inside the guard's callback, so every stacked closure sees the truth
// without any render-time ref access.
const pristineValuesByUserId = new Map<string, SavedStaffUserEditValues>();
const lastSavedValuesByUserId = new Map<string, SavedStaffUserEditValues>();

const normalizeAccountLevel = (
	value: string | null,
): StaffUserEditValues['accountLevel'] =>
	value === 'Admin' ? 'Admin' : 'User';

const normalizeStatus = (value: string | null): StaffUserEditValues['status'] =>
	value === 'Suspended' ? 'Suspended' : 'Active';

/**
 * Strict per-field equality over the edit form's values. The nav guard
 * compares the LIVE form values against the last hydrated (pristine) and the
 * last successfully saved snapshots — both held in component refs that are
 * written outside render and read only inside the guard's callback.
 */
const staffUserEditValuesMatch = (
	left: StaffUserEditValues,
	right: StaffUserEditValues,
): boolean =>
	left.firstName === right.firstName &&
	left.lastName === right.lastName &&
	left.avatarUrl === right.avatarUrl &&
	left.email === right.email &&
	left.accountLevel === right.accountLevel &&
	left.status === right.status &&
	left.profileIds.length === right.profileIds.length &&
	left.profileIds.every(
		(profileId, index) => profileId === right.profileIds[index],
	);

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

const getUnsavedChangesStatus = ({
	isDirty,
	attentionCount,
	unsavedChanges,
	fieldsNeedAttention,
}: {
	isDirty: boolean;
	attentionCount: number;
	unsavedChanges: string;
	fieldsNeedAttention: string;
}): string | undefined => {
	if (!isDirty) {
		return undefined;
	}

	if (attentionCount > 0) {
		return `${unsavedChanges} · ${fieldsNeedAttention}`;
	}

	return unsavedChanges;
};

const StaffUserEditLoading = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center px-4 py-12"
			data-testid="staff-user-edit-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<span
					role="status"
					aria-label={t('common:loading')}
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
	const { t } = useTranslation(['staff-users', 'common']);

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, 'malformed-id')
	) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('common:error-404-code')}
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
			code={t('common:error-500-code')}
			title={t('unable-to-load-staff-user')}
			description={t('problem-loading-staff-user-details')}
			testId="staff-user-edit-error"
			actions={
				<>
					<Button variant="default" onClick={onRetry} type="button">
						{t('common:try-again')}
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

const StaffUserEditPage = () => {
	const { userId } = Route.useParams();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t } = useTranslation(['staff-users', 'common']);
	const [shouldLogout, setShouldLogout] = useState(false);
	const [serverError, setServerError] = useState('');
	const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);
	const [profileSearch, setProfileSearch] = useState('');
	const deferredProfileSearch = useDeferredValue(profileSearch.trim());
	const isProfileSearchSettled = profileSearch.trim() === deferredProfileSearch;

	const detailsQuery = useStaffUserDetailsQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const assignedProfilesQuery = useStaffUserProfilesQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const profilePagination = useCursorPagination({
		sortId: 'name',
		sortOrder: 'asc',
		size: PROFILE_PAGE_SIZE,
		scopeKey: `${userId}:${deferredProfileSearch}`,
	});
	const profilesQuery = useStaffProfilesQuery({
		limit: PROFILE_PAGE_SIZE,
		sortId: 'name',
		sortOrder: 'asc',
		q: deferredProfileSearch || undefined,
		cursor: profilePagination.cursor,
	});
	const hasNoServerProfileRows = profilesQuery.data?.data?.length === 0;
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
	const watchedProfileIds = useWatch({
		control: methods.control,
		name: 'profileIds',
	});
	const selectedProfileIds = collectSelectedProfileIds([watchedProfileIds]);
	// #1301: the remembered-label map lives in state instead of a ref so
	// nothing reads mutable data during render. New query payloads are
	// absorbed through React's documented "adjust state during render"
	// pattern: guarded, keyed setState calls that React replays by discarding
	// the in-flight render, so the store converges without effects or refs.
	// Hoisted like the pending/error flags below (#1305 idiom): the keyed
	// absorption logic branches on a plain local, not a raw query flag.
	const profilesIsSuccess = profilesQuery.isSuccess;
	const [knownProfileNamesById, setKnownProfileNamesById] = useState(() => {
		const seeded = new Map<string, string>();
		rememberStaffProfileNames(seeded, assignedProfiles);
		if (profilesIsSuccess) {
			rememberStaffProfileNames(seeded, profilesQuery.data?.data);
		}

		return seeded;
	});
	// Seen-payload keys derive from stable row identities (ids + names) —
	// the same content the assigned-side key below uses. Serialising the raw
	// payload with JSON.stringify here would throw DURING RENDER if the
	// catalogue ever carried a cyclic value (#1314-r1); ids/names cannot.
	const catalogueSeenKey = [
		profilesIsSuccess ? 'success' : 'pending',
		...(profilesQuery.data?.data ?? []).map(
			(profile) => `${profile.id}·${profile.name ?? ''}`,
		),
	].join('¦');
	const assignedSeenKey = assignedProfiles
		.map((profile) => `${profile.id}·${profile.name ?? ''}`)
		.join('¦');
	const [seenCatalogueKey, setSeenCatalogueKey] = useState(catalogueSeenKey);
	const [seenAssignedKey, setSeenAssignedKey] = useState(assignedSeenKey);
	const [hasLoadedProfiles, setHasLoadedProfiles] = useState(
		profilesQuery.isSuccess,
	);
	if (seenCatalogueKey !== catalogueSeenKey) {
		setSeenCatalogueKey(catalogueSeenKey);
		if (profilesIsSuccess) {
			setHasLoadedProfiles(true);
			setKnownProfileNamesById((previous) => {
				const merged = new Map<string, string>(previous);
				rememberStaffProfileNames(merged, profilesQuery.data?.data);
				return merged;
			});
		}
	}

	if (seenAssignedKey !== assignedSeenKey) {
		setSeenAssignedKey(assignedSeenKey);
		setKnownProfileNamesById((previous) => {
			const merged = new Map<string, string>(previous);
			rememberStaffProfileNames(merged, assignedProfiles);
			return merged;
		});
	}

	// Pure per-render merge of remembered profile labels with what the
	// current queries provide; only state and props are read here.
	const knownProfileNames = useMemo(() => {
		const merged = new Map<string, string>(knownProfileNamesById);
		rememberStaffProfileNames(merged, assignedProfiles);
		rememberStaffProfileNames(merged, profilesQuery.data?.data);
		return merged;
	}, [knownProfileNamesById, assignedProfiles, profilesQuery.data]);
	const profileOptions = buildStaffProfileOptions({
		profiles: profilesQuery.data?.data,
		selectedProfileIds,
		knownProfileNames,
		includeDescriptions: true,
	});
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

		const nextValues: StaffUserEditValues = {
			firstName: user.firstName ?? '',
			lastName: user.lastName ?? '',
			avatarUrl: user.avatarUrl ?? '',
			email: user.email,
			accountLevel: normalizeAccountLevel(user.accountLevel),
			status: normalizeStatus(user.status),
			profileIds: assignedProfiles.map((profile) => profile.id),
		};
		reset(nextValues);
		hydratedUserIdRef.current = userId;
		// Pristine-truth snapshot for the guard, kept in lockstep with the
		// reset above. A fresh hydration also invalidates any saved snapshot
		// left over from a previous visit: the server state it described may
		// have diverged since.
		pristineValuesByUserId.set(userId, { ...nextValues, userId });
		lastSavedValuesByUserId.delete(userId);
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

	const blocker = useBlocker({
		// Decides from the LIVE form values compared against the pristine
		// (hydration-time) or last-saved snapshot — never from a
		// render-frozen copy. Every closure `history.block` has stacked is
		// consulted at navigation time, so a state-based `hasSaved` flag can
		// never answer synchronously here without reading stale data exactly
		// on the post-save redirect (#1314-r1 MAJOR).
		shouldBlockFn: () => {
			const saved = lastSavedValuesByUserId.get(userId);
			const hydrated = pristineValuesByUserId.get(userId);
			const baseline = saved ?? hydrated;
			if (!baseline) {
				return false;
			}

			return !staffUserEditValuesMatch(methods.getValues(), baseline);
		},
		withResolver: true,
	});

	// Hoisted so the fatal-error gates read plain locals, not query flags.
	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const assignedProfilesError = assignedProfilesQuery.error;
	if (
		assignedProfilesError !== null &&
		shouldLogoutForFailure(assignedProfilesError)
	) {
		return <LogoutRedirect />;
	}

	const profilesError = profilesQuery.error;
	if (profilesError !== null && shouldLogoutForFailure(profilesError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const detailsIsPending = detailsQuery.isPending;
	const assignedProfilesIsPending = assignedProfilesQuery.isPending;
	const profilesIsPending = profilesQuery.isPending;
	if (
		detailsIsPending ||
		assignedProfilesIsPending ||
		(profilesIsPending && !hasLoadedProfiles)
	) {
		return <StaffUserEditLoading />;
	}

	const detailsIsError = detailsQuery.isError;
	if (detailsIsError) {
		return (
			<StaffUserEditError
				error={detailsError}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	const assignedProfilesIsError = assignedProfilesQuery.isError;
	if (assignedProfilesIsError) {
		return (
			<StaffUserEditError
				error={assignedProfilesError}
				onRetry={() => void assignedProfilesQuery.refetch()}
			/>
		);
	}

	const profilesIsError = profilesQuery.isError;
	if (profilesIsError) {
		return (
			<StaffUserEditError
				error={profilesError}
				onRetry={() => void profilesQuery.refetch()}
			/>
		);
	}

	if (!user) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('common:error-404-code')}
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
		const updateInput: {
			userId: string;
			firstName?: string | null;
			lastName?: string | null;
			avatarUrl?: string | null;
			accountLevel?: StaffUserEditValues['accountLevel'];
		} = { userId };
		if (formState.dirtyFields.firstName) {
			updateInput.firstName = values.firstName?.trim() || null;
		}
		if (formState.dirtyFields.lastName) {
			updateInput.lastName = values.lastName?.trim() || null;
		}
		if (formState.dirtyFields.avatarUrl) {
			updateInput.avatarUrl = values.avatarUrl.trim() || null;
		}
		if (formState.dirtyFields.accountLevel) {
			updateInput.accountLevel = values.accountLevel;
		}
		const hasIdentityChanges = Object.keys(updateInput).length > 1;
		const hasProfileChanges = Boolean(formState.dirtyFields.profileIds);

		setServerError('');

		if (hasIdentityChanges) {
			try {
				await updateStaffUser.mutateAsync(updateInput);
			} catch (error) {
				if (shouldLogoutForFailure(error)) {
					setShouldLogout(true);
					return;
				}

				await displayLocalMutationFailure(error, t('unknown-error'));
				return;
			}

			// The identity write is now durable — mark only the committed
			// fields clean at their new values so a retry after a later
			// failure can't resend an already-saved step, then refetch.
			// `profileIds` is untouched here: while it is still dirty the
			// hydration effect's `formState.isDirty` guard bails out, so
			// this refetch cannot wipe an in-progress, not-yet-saved profile
			// selection (r3-F8).
			for (const field of [
				'firstName',
				'lastName',
				'avatarUrl',
				'accountLevel',
			] as const) {
				if (formState.dirtyFields[field]) {
					methods.resetField(field, { defaultValue: values[field] });
				}
			}
			await invalidateStaffUsers(queryClient);
		}

		if (hasProfileChanges) {
			try {
				await updateStaffUserProfiles.mutateAsync({
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

		// Recorded synchronously BEFORE the redirect below: the guard compares
		// against this snapshot live, so the stacked blocker closures see the
		// post-save truth in the same tick `navigate()` runs.
		lastSavedValuesByUserId.set(userId, { ...values, userId });
		toastLocalMutationResult.success(t('staff-user-updated-success'));
		void navigate({
			to: '/staff/staff-users/$userId',
			params: { userId },
		});
	});

	const isSubmittingForm =
		isSubmitting ||
		updateStaffUser.isPending ||
		updateStaffUserProfiles.isPending;
	const attentionCount = Object.keys(errors).length;
	const status = getUnsavedChangesStatus({
		isDirty: formState.isDirty,
		attentionCount,
		unsavedChanges: t('common:unsaved-changes'),
		fieldsNeedAttention: t('fields-need-attention', { count: attentionCount }),
	});

	return (
		<FormPageLayout data-testid="staff-user-edit-page">
			<div className="space-y-2">
				<Link
					to="/staff/staff-users/$userId"
					params={{ userId }}
					className="publy-back-link"
				>
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('common:back-to-user')}
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
						<p className="publy-type-section-title">{t('common:identity')}</p>
					</div>
					<div className="grid gap-4 p-5 md:grid-cols-2">
						<Field.Text
							name="firstName"
							label={t('common:first-name')}
							placeholder={t('common:first-name')}
							isDisabled={isSubmittingForm}
						/>
						<Field.Text
							name="lastName"
							label={t('common:last-name')}
							placeholder={t('common:last-name')}
							isDisabled={isSubmittingForm}
						/>
						<div className="space-y-2">
							<Field.Email
								name="email"
								label={t('common:email-address')}
								helperText={t('email-managed-separately')}
								isDisabled
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setIsChangeEmailOpen(true)}
							>
								{t('change-email')}
							</Button>
						</div>
						<Field.Text
							name="avatarUrl"
							label={t('common:avatar-url')}
							placeholder="https://example.com/avatar.png"
							isDisabled={isSubmittingForm}
						/>
					</div>
				</section>

				<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
					<div className="publy-card-header">
						<p className="publy-type-section-title">{t('common:access')}</p>
					</div>
					<div className="space-y-4 p-5">
						<div className="grid gap-4 md:grid-cols-2">
							<Field.Select
								name="accountLevel"
								label={t('role')}
								options={ACCOUNT_LEVEL_OPTIONS.map((value) => ({
									value,
									label: t(value === 'Admin' ? 'common:admin' : 'common:user'),
								}))}
								isDisabled={isSubmittingForm}
							/>
							{/* TODO(contract): status changes use suspend/reactivate endpoints. */}
							<Field.Select
								name="status"
								label={t('common:status')}
								helperText={t('status-managed-from-details')}
								options={STATUS_OPTIONS.map((value) => ({
									value,
									label: t(
										value === 'Active'
											? 'common:status-active'
											: 'common:status-suspended',
									),
								}))}
								isDisabled
							/>
						</div>
						<div className="space-y-1">
							<label
								className="text-sm font-medium text-foreground"
								htmlFor="staff-user-profile-search"
							>
								{t('common:search-profiles')}
							</label>
							<Input
								id="staff-user-profile-search"
								aria-label={t('common:search-profiles')}
								value={profileSearch}
								onChange={(event) => {
									setProfileSearch(event.target.value);
								}}
								placeholder={t('common:search-profiles')}
								autoComplete="off"
								disabled={isSubmittingForm}
								data-testid="staff-user-profile-search"
							/>
						</div>
						{profilesQuery.isFetching ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<LoadingSpinner />
								<span>{t('common:profiles')}</span>
							</div>
						) : null}
						{profileOptions.length > 0 ? (
							<Field.CheckboxGroup
								name="profileIds"
								label={t('common:select-profiles')}
								options={profileOptions}
								isDisabled={
									isSubmittingForm ||
									profilesIsPending ||
									profilesQuery.isFetching
								}
							/>
						) : null}
						{hasNoServerProfileRows &&
						isProfileSearchSettled &&
						!profilesIsPending &&
						!profilesQuery.isFetching ? (
							<p role="status" className="text-sm text-muted-foreground">
								{deferredProfileSearch
									? t('common:list-no-match-default-description')
									: t('common:no-profiles-available')}
							</p>
						) : null}
						{profilePagination.hasPreviousPage ||
						profilesQuery.data?.nextCursor ? (
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs text-muted-foreground">
									{t('common:page-n', {
										page: profilePagination.pageIndex + 1,
									})}
								</p>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={t('common:previous-page')}
										disabled={
											isSubmittingForm ||
											profilesQuery.isFetching ||
											!profilePagination.hasPreviousPage
										}
										onClick={profilePagination.retreat}
									>
										{t('common:previous-page')}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={t('common:next-page')}
										disabled={
											isSubmittingForm ||
											profilesQuery.isFetching ||
											!profilesQuery.data?.nextCursor
										}
										onClick={() =>
											profilePagination.advance(
												profilesQuery.data?.nextCursor ?? undefined,
											)
										}
									>
										{t('common:next-page')}
									</Button>
								</div>
							</div>
						) : null}
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
						{t('common:cancel')}
					</Button>
					<Button
						type="submit"
						disabled={isSubmittingForm || !formState.isDirty}
					>
						{t('common:save-changes')}
					</Button>
				</FormActionBar>
			</Form>
			<ChangeStaffUserEmailDialog
				userId={userId}
				currentEmail={user?.email ?? ''}
				isOpen={isChangeEmailOpen}
				onOpenChange={setIsChangeEmailOpen}
				onUpdated={() => setIsChangeEmailOpen(false)}
				onSessionExpired={() => setShouldLogout(true)}
			/>
			<ConfirmDialog
				isOpen={blocker.status === 'blocked'}
				title={t('common:unsaved-changes-dialog-title')}
				description={t('common:unsaved-changes-dialog-description')}
				confirmLabel={t('common:leave-page')}
				cancelLabel={t('common:cancel')}
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

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/edit',
)({
	staticData: {
		i18nNamespaces: ['staff-users'],
		crumbs: (params) => [
			...staffUserCrumbsBase(params),
			{ kind: 'label', labelKey: 'common:edit' },
		],
	},
	component: StaffUserEditPage,
});
