import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import type { i18n as I18nInstance } from 'i18next';
import {
	startTransition,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { FALLBACK_LANGUAGE, isSupportedLanguage } from '~/lib/i18n.shared';
import {
	invalidateStaffInvitations,
	useBulkCreateStaffInvitationsMutation,
	type StaffInvitationInput,
} from '~/lib/query/staff-invitations';
import { useStaffProfilesQuery } from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import InterZod from '@org/shared-ts/lib/zod/InterZod';
import { getBulkCreateInvitationsSchema } from '@org/shared-ts/validations/invitation.validations';

import {
	buildStaffProfileOptions,
	collectSelectedProfileIds,
	rememberStaffProfileNames,
} from '../_staff-profile-options';

type InvitationFormValues = z.infer<
	ReturnType<typeof getBulkCreateInvitationsSchema>
>;

type InterZodOptions = ConstructorParameters<typeof InterZod>[0];
type InterZodI18nLike = InterZodOptions['i18n'];

const DEFAULT_VALUES: InvitationFormValues = {
	invitations: [
		{
			email: '',
			profileIds: [],
		},
	],
};

export const STAFF_INVITATIONS_INDEX_PATH = '/staff/invitations';

// Success-toast dwell time before redirecting to the invitations index.
const REDIRECT_DELAY_MS = 600;

const getInterZodForI18n = (instance: I18nInstance) => {
	const locale = isSupportedLanguage(instance.language)
		? instance.language
		: FALLBACK_LANGUAGE;
	const i18nLike: InterZodI18nLike = {
		getFixedT: instance.getFixedT.bind(instance),
		t: instance.t.bind(instance),
	};

	return new InterZod({
		i18n: i18nLike,
		locale,
	});
};

const InvitationProfileField = ({
	index,
	profileLoadError,
	profilesQuery,
	profileOptions,
	isPending,
}: {
	index: number;
	profileLoadError: string;
	profilesQuery: ReturnType<typeof useStaffProfilesQuery>;
	profileOptions: ReturnType<typeof buildStaffProfileOptions>;
	isPending: boolean;
}) => {
	const { t } = useTranslation(['staff-invitations', 'common']);

	if (profileLoadError) {
		return <p className="text-sm text-destructive">{profileLoadError}</p>;
	}

	if (profilesQuery.isPending) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('common:profiles')}</span>
			</div>
		);
	}

	if (profileOptions.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">{t('no-results-found')}</p>
		);
	}

	return (
		<Field.CheckboxGroup
			name={`invitations.${index}.profileIds`}
			label={t('common:select-profiles')}
			helperText={t('select-at-least-one-profile')}
			options={profileOptions}
			isDisabled={isPending || profilesQuery.isPending}
		/>
	);
};

const NewStaffInvitationsRoute = () => {
	const navigate = Route.useNavigate();
	const { t, i18n } = useTranslation(['staff-invitations', 'common']);
	const [profileSearch, setProfileSearch] = useState('');
	const deferredProfileSearch = useDeferredValue(profileSearch.trim());
	const [serverErrors, setServerErrors] = useState<string[]>([]);
	// Post-success redirect is driven by state: the submit handler only arms
	// a flag, and the effect below owns the timer (and its cleanup). A ref
	// write inside onSubmit taints it for React Compiler, skipping the whole
	// component.
	const [redirectCountdown, setRedirectCountdown] = useState(0);
	// Known profile names, accumulated as state. The render reads this map
	// directly (a ref read here made React Compiler skip the component); the
	// effect below folds each page of fetched profiles into it idempotently.
	const [knownProfileNamesState, setKnownProfileNamesState] = useState(
		() => new Map<string, string>(),
	);

	const resolver = useMemo(
		() => zodResolver(getBulkCreateInvitationsSchema(getInterZodForI18n(i18n))),
		[i18n, i18n.language],
	);

	const methods = useForm<InvitationFormValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});

	const {
		control,
		formState: { isSubmitting, isDirty },
	} = methods;

	const blocker = useBlocker({
		shouldBlockFn: () => isDirty,
		withResolver: true,
	});
	const { fields, append, remove } = useFieldArray({
		control,
		name: 'invitations',
	});
	const watchedInvitations = useWatch({
		control,
		name: 'invitations',
	}) as StaffInvitationInput[] | undefined;

	const profilesQuery = useStaffProfilesQuery({
		limit: 20,
		sortId: 'name',
		sortOrder: 'asc',
		q: deferredProfileSearch || undefined,
	});
	const queryClient = useQueryClient();
	const createInvitations = useBulkCreateStaffInvitationsMutation();

	useEffect(() => {
		if (redirectCountdown === 0) {
			return;
		}
		const remaining = redirectCountdown - Date.now();
		const timeout = setTimeout(
			() => {
				startTransition(() => {
					void navigate({
						to: STAFF_INVITATIONS_INDEX_PATH,
					});
				});
			},
			Math.max(remaining, 0),
		);
		return () => {
			clearTimeout(timeout);
		};
	}, [navigate, redirectCountdown]);

	useEffect(() => {
		if (profilesQuery.data === undefined) {
			return;
		}
		setKnownProfileNamesState((previous) => {
			const next = new Map(previous);
			rememberStaffProfileNames(next, profilesQuery.data?.data);
			return next.size === previous.size ? previous : next;
		});
	}, [profilesQuery.data]);

	// Fresh page rows are unioned synchronously so an option label never lags
	// one render behind its data; the accumulated map only carries history.
	const knownProfileNames = useMemo(() => {
		const merged = new Map(knownProfileNamesState);
		rememberStaffProfileNames(merged, profilesQuery.data?.data);
		return merged;
	}, [knownProfileNamesState, profilesQuery.data]);

	// Hoisted so the fatal-error gate reads a plain local, not a query flag.
	const profilesError = profilesQuery.error;
	if (profilesError !== null && shouldLogoutForFailure(profilesError)) {
		return <LogoutRedirect />;
	}

	const selectedProfileIds = collectSelectedProfileIds(
		watchedInvitations?.map((invitation) => invitation.profileIds),
	);
	const profileOptions = buildStaffProfileOptions({
		profiles: profilesQuery.data?.data,
		selectedProfileIds,
		knownProfileNames,
	});
	const isPending = isSubmitting || createInvitations.isPending;
	const profileLoadError =
		profilesError !== null
			? getFailureMessage(toApiFailure(profilesError), {
					fallback: t('common:unable-to-load-profiles'),
				})
			: '';

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerErrors([]);

		try {
			await createInvitations.mutateAsync(values);

			await invalidateStaffInvitations(queryClient);
			methods.reset(DEFAULT_VALUES);

			// Arm the post-success redirect; the effect below owns the timer.
			setRedirectCountdown(Date.now() + REDIRECT_DELAY_MS);
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const messages = Object.values(failure.fieldErrors).flat();
				setServerErrors(
					messages.length > 0
						? messages
						: [
								getFailureMessage(failure, {
									fallback: t('validation-failed'),
								}),
							],
				);
				return;
			}
		}
	});

	return (
		<div
			className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-4"
			data-testid="staff-invitations-create-page"
		>
			<div className="space-y-1">
				<Link to={STAFF_INVITATIONS_INDEX_PATH} className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('common:staff-invitations')}
				</Link>
				<h1 className="publy-type-page-title">{t('common:invite-users')}</h1>
				<p className="publy-type-helper">
					{t('send-email-invitations-and-assign-staff-profiles')}
				</p>
			</div>

			<Card className="space-y-4 p-4">
				<div className="space-y-1">
					<label
						className="text-sm font-medium text-foreground"
						htmlFor="profile-search"
					>
						{t('common:profiles')}
					</label>
					<Input
						id="profile-search"
						value={profileSearch}
						onChange={(event) => {
							setProfileSearch(event.target.value);
						}}
						placeholder={t('common:search')}
						autoComplete="off"
						data-testid="staff-invitations-profile-search"
					/>
					<p className="text-xs text-muted-foreground">
						{t('select-at-least-one-profile')}
					</p>
				</div>

				{profilesQuery.isFetching ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<LoadingSpinner />
						<span>{t('common:profiles')}</span>
					</div>
				) : null}

				{serverErrors.length > 0 ? (
					<div className="rounded-medium border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						<ul className="list-disc space-y-1 pl-5">
							{serverErrors.map((error) => (
								<li key={error}>{error}</li>
							))}
						</ul>
					</div>
				) : null}

				<Form methods={methods} onSubmit={onSubmit}>
					<div className="space-y-4">
						{fields.map((field, index) => (
							<Card key={field.id} className="space-y-4 p-4">
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-1">
										<h2 className="text-lg font-semibold">
											{t('common:invitation')} #{index + 1}
										</h2>
										<p className="text-sm text-muted-foreground">
											{t('enter-email-and-select-profiles')}
										</p>
									</div>
									{fields.length > 1 ? (
										<Button
											type="button"
											variant="destructive"
											onClick={() => {
												remove(index);
											}}
											disabled={isPending}
										>
											{t('remove-invitation')}
										</Button>
									) : null}
								</div>

								<Field.Email
									name={`invitations.${index}.email`}
									label={t('common:email-address')}
									placeholder={t('common:email-placeholder')}
									required
									disabled={isPending}
								/>

								<InvitationProfileField
									index={index}
									profileLoadError={profileLoadError}
									profilesQuery={profilesQuery}
									profileOptions={profileOptions}
									isPending={isPending}
								/>
							</Card>
						))}

						<div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									append({
										email: '',
										profileIds: [],
									});
								}}
								disabled={isPending}
								data-testid="staff-invitations-add"
							>
								{t('add-invitation')}
							</Button>
							<Button
								type="submit"
								variant="default"
								disabled={isPending || profilesQuery.isPending}
								data-testid="staff-invitations-submit"
							>
								{isPending ? <LoadingSpinner /> : null}
								{t('send-invitations')}
							</Button>
						</div>
					</div>
				</Form>
			</Card>
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
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/invitations/new')({
	staticData: {
		i18nNamespaces: ['staff-invitations'],
		crumbs: () => [
			{
				kind: 'label',
				labelKey: 'nav-staff-invitations',
				to: '/staff/invitations',
			},
			{ kind: 'label', labelKey: 'common:new-invitation' },
		],
	},
	component: NewStaffInvitationsRoute,
});
