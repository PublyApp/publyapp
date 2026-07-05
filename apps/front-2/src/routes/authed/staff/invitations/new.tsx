import { Button, Card, Input, Spinner } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { i18n as I18nInstance } from 'i18next';
import {
	startTransition,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import { FALLBACK_LANGUAGE, isSupportedLanguage } from '~/lib/i18n.shared';
import {
	useBulkCreateStaffInvitationsMutation,
	type StaffInvitationInput,
} from '~/lib/query/staff-invitations';
import { useStaffProfilesQuery } from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import type { StaffProfileItem } from '@org/client-ts/src/models/index.js';
import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import InterZod from '@org/shared-ts/lib/zod/InterZod';
import { getBulkCreateInvitationsSchema } from '@org/shared-ts/validations/invitation.validations';

type InvitationFormValues = z.infer<
	ReturnType<typeof getBulkCreateInvitationsSchema>
>;

type ProfileOption = {
	value: string;
	label: string;
};

type BuildProfileOptionsArgs = {
	profiles: Array<Pick<StaffProfileItem, 'id' | 'name'>> | null | undefined;
	selectedProfileIds: string[];
	knownProfileNames: Map<string, string>;
};
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

const STAFF_INVITATIONS_REDIRECT_PATH = '/staff/staff-users';
// TODO(#736): redirect to `/staff/invitations` once the index route is migrated in front-2.

const getInterZodForI18n = (instance: I18nInstance) => {
	const locale = isSupportedLanguage(instance.language)
		? instance.language
		: FALLBACK_LANGUAGE;
	const i18nLike: InterZodI18nLike = {
		getFixedT: instance.getFixedT.bind(instance),
		t: instance.t.bind(instance) as never,
	};

	return new InterZod({
		i18n: i18nLike,
		locale,
	});
};

const getProfileId = (
	profile: Pick<StaffProfileItem, 'id'>,
): string | undefined =>
	typeof profile.id === 'string' && profile.id.length > 0
		? profile.id
		: undefined;

const collectSelectedProfileIds = (
	invitations: StaffInvitationInput[] | undefined,
): string[] => {
	if (!Array.isArray(invitations)) {
		return [];
	}

	const selected = new Set<string>();
	for (const invitation of invitations) {
		for (const profileId of invitation.profileIds) {
			if (profileId) {
				selected.add(profileId);
			}
		}
	}

	return [...selected];
};

export const buildProfileOptions = ({
	profiles,
	selectedProfileIds,
	knownProfileNames,
}: BuildProfileOptionsArgs): ProfileOption[] => {
	const options: ProfileOption[] = [];
	const seen = new Set<string>();

	for (const profile of profiles ?? []) {
		const profileId = getProfileId(profile);
		if (!profileId || seen.has(profileId)) {
			continue;
		}

		options.push({
			value: profileId,
			label:
				profile.name?.trim() || knownProfileNames.get(profileId) || profileId,
		});
		seen.add(profileId);
	}

	for (const profileId of selectedProfileIds) {
		if (!profileId || seen.has(profileId)) {
			continue;
		}

		options.push({
			value: profileId,
			label: knownProfileNames.get(profileId) || profileId,
		});
		seen.add(profileId);
	}

	return options;
};

export const Route = createFileRoute('/_authed-layout/staff/invitations/new')({
	component: NewStaffInvitationsRoute,
});

function NewStaffInvitationsRoute() {
	const navigate = Route.useNavigate();
	const { t, i18n } = useTranslation('common');
	const [profileSearch, setProfileSearch] = useState('');
	const deferredProfileSearch = useDeferredValue(profileSearch.trim());
	const [serverErrors, setServerErrors] = useState<string[]>([]);
	const [successMessage, setSuccessMessage] = useState('');
	const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const knownProfileNamesRef = useRef(new Map<string, string>());

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
		formState: { isSubmitting },
	} = methods;
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
	const createInvitations = useBulkCreateStaffInvitationsMutation();

	useEffect(() => {
		return () => {
			if (redirectTimeoutRef.current) {
				clearTimeout(redirectTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const profiles = profilesQuery.data?.data ?? [];
		for (const profile of profiles) {
			const profileId = getProfileId(profile);
			const label = profile.name?.trim();
			if (!profileId || !label) {
				continue;
			}

			knownProfileNamesRef.current.set(profileId, label);
		}
	}, [profilesQuery.data]);

	if (profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error)) {
		return <LogoutRedirect />;
	}

	const selectedProfileIds = collectSelectedProfileIds(watchedInvitations);
	const profileOptions = buildProfileOptions({
		profiles: profilesQuery.data?.data,
		selectedProfileIds,
		knownProfileNames: knownProfileNamesRef.current,
	});
	const isPending = isSubmitting || createInvitations.isPending;
	const profileLoadError = profilesQuery.isError
		? getFailureMessage(toApiFailure(profilesQuery.error), {
				fallback: 'Unable to load profiles.',
			})
		: '';

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerErrors([]);
		setSuccessMessage('');

		try {
			const result = await createInvitations.mutateAsync(values);
			const createdCount = result?.created ?? values.invitations.length;

			methods.reset(DEFAULT_VALUES);
			setSuccessMessage(
				t('invitations-sent-successfully', { count: createdCount }),
			);

			redirectTimeoutRef.current = setTimeout(() => {
				startTransition(() => {
					void navigate({
						to: STAFF_INVITATIONS_REDIRECT_PATH,
					});
				});
			}, 600);
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const messages = Object.values(failure.fieldErrors).flat();
				setServerErrors(
					messages.length > 0
						? messages
						: [
								getFailureMessage(failure, {
									fallback: 'Validation failed.',
								}),
							],
				);
				return;
			}

			setServerErrors([
				getFailureMessage(failure, {
					fallback: 'Invitations could not be sent.',
				}),
			]);
		}
	});

	return (
		<div
			className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-4"
			data-testid="staff-invitations-create-page"
		>
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="space-y-1">
					<p className="text-sm text-foreground-500">
						{t('staff-invitations')}
					</p>
					<h1 className="text-2xl font-semibold">{t('invite-users')}</h1>
				</div>
				<Link
					to="/staff/staff-users"
					className="text-sm font-medium text-primary underline-offset-4 hover:underline"
				>
					{t('staff-invitations')}
				</Link>
			</div>

			<Card className="space-y-4 p-4">
				<div className="space-y-1">
					<label
						className="text-sm font-medium text-foreground-700"
						htmlFor="profile-search"
					>
						{t('profiles')}
					</label>
					<Input
						id="profile-search"
						value={profileSearch}
						onChange={(event) => {
							setProfileSearch(event.target.value);
						}}
						placeholder={t('search')}
						autoComplete="off"
						data-testid="staff-invitations-profile-search"
					/>
					<p className="text-xs text-foreground-500">
						{t('select-at-least-one-profile')}
					</p>
				</div>

				{profilesQuery.isFetching ? (
					<div className="flex items-center gap-2 text-sm text-foreground-500">
						<Spinner size="sm" />
						<span>{t('profiles')}</span>
					</div>
				) : null}

				{successMessage ? (
					<div className="rounded-medium border border-success-300 bg-success-50 px-3 py-2 text-sm text-success-700">
						{successMessage}
					</div>
				) : null}

				{serverErrors.length > 0 ? (
					<div className="rounded-medium border border-danger-300 bg-danger-50 px-3 py-2 text-sm text-danger-700">
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
											{t('invitation')} #{index + 1}
										</h2>
										<p className="text-sm text-foreground-500">
											{t('enter-email-and-select-profiles')}
										</p>
									</div>
									{fields.length > 1 ? (
										<Button
											type="button"
											variant="danger-soft"
											onPress={() => {
												remove(index);
											}}
											isDisabled={isPending}
										>
											{t('remove-invitation')}
										</Button>
									) : null}
								</div>

								<Field.Email
									name={`invitations.${index}.email`}
									label={t('email-address')}
									placeholder="name@company.com"
									required
									disabled={isPending}
								/>

								{profileLoadError ? (
									<p className="text-sm text-danger-500">{profileLoadError}</p>
								) : profilesQuery.isPending ? (
									<div className="flex items-center gap-2 text-sm text-foreground-500">
										<Spinner size="sm" />
										<span>{t('profiles')}</span>
									</div>
								) : profileOptions.length === 0 ? (
									<p className="text-sm text-foreground-500">
										{t('no-results-found')}
									</p>
								) : (
									<Field.CheckboxGroup
										name={`invitations.${index}.profileIds`}
										label={t('select-profiles')}
										helperText={t('select-at-least-one-profile')}
										options={profileOptions}
										isDisabled={isPending || profilesQuery.isPending}
									/>
								)}
							</Card>
						))}

						<div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
							<Button
								type="button"
								variant="outline"
								onPress={() => {
									append({
										email: '',
										profileIds: [],
									});
								}}
								isDisabled={isPending}
								data-testid="staff-invitations-add"
							>
								{t('add-invitation')}
							</Button>
							<Button
								type="submit"
								variant="primary"
								isDisabled={isPending || profilesQuery.isPending}
								data-testid="staff-invitations-submit"
							>
								{isPending ? <Spinner size="sm" /> : null}
								{t('send-invitations')}
							</Button>
						</div>
					</div>
				</Form>
			</Card>
		</div>
	);
}
