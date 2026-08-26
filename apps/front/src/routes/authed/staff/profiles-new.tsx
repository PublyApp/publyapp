import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import type { i18n as I18nInstance } from 'i18next';
import { useMemo, useState } from 'react';
import { useWatch, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { IconColorPicker } from '~/components/ui/icon-color-picker';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { FALLBACK_LANGUAGE, isSupportedLanguage } from '~/lib/i18n.shared';
import {
	invalidateStaffProfiles,
	useCreateStaffProfileMutation,
	useStaffPermissionCatalogQuery,
} from '~/lib/query/staff-profiles';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';
import InterZod from '@org/shared-ts/lib/zod/InterZod';
import { getNewStaffProfileSchema } from '@org/shared-ts/validations/staff-profile.validations';

import {
	buildStaffPermissionOptions,
	type StaffPermissionOption,
} from './_staff-permission-options';

type NewStaffProfileValues = z.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

type InterZodOptions = ConstructorParameters<typeof InterZod>[0];
type InterZodI18nLike = InterZodOptions['i18n'];

const STAFF_PROFILE_FORM_FIELDS = [
	'name',
	'description',
	'icon',
	'tone',
	'permissions',
	'emails',
] as const satisfies readonly (keyof NewStaffProfileValues)[];

const isStaffProfileFormField = (
	field: string,
): field is (typeof STAFF_PROFILE_FORM_FIELDS)[number] =>
	STAFF_PROFILE_FORM_FIELDS.some((candidate) => candidate === field);

const DEFAULT_VALUES: NewStaffProfileValues = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
	icon: '',
	tone: '',
};

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

const NewStaffProfileForm = ({
	permissionsQuery,
	methods,
	onSubmit,
	permissionOptions,
}: {
	permissionsQuery: ReturnType<typeof useStaffPermissionCatalogQuery>;
	methods: ReturnType<typeof useForm<NewStaffProfileValues>>;
	onSubmit: (event?: React.BaseSyntheticEvent) => void;
	permissionOptions: StaffPermissionOption[];
}) => {
	const { t } = useTranslation('common');
	const { t: tProfiles } = useTranslation('staff-tenant-profiles');
	const createProfile = useCreateStaffProfileMutation();
	const icon = useWatch({ control: methods.control, name: 'icon' });
	const tone = useWatch({ control: methods.control, name: 'tone' });

	if (permissionsQuery.isPending) {
		return (
			<div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-permissions')}</span>
			</div>
		);
	}

	if (permissionsQuery.isError) {
		return (
			<div className="space-y-3">
				<p className="text-sm text-destructive">
					{getFailureMessage(toApiFailure(permissionsQuery.error), {
						fallback: t('unable-to-load-staff-permissions'),
					})}
				</p>
				<Button
					type="button"
					variant="secondary"
					onClick={() => void permissionsQuery.refetch()}
				>
					{t('retry')}
				</Button>
			</div>
		);
	}

	return (
		<Form methods={methods} onSubmit={onSubmit}>
			<div className="space-y-1.5">
				<div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
					<IconColorPicker
						value={{ icon, tone }}
						disabled={createProfile.isPending}
						onChange={(next) => {
							methods.setValue('icon', next.icon ?? icon, {
								shouldDirty: true,
							});
							methods.setValue('tone', next.tone ?? tone, {
								shouldDirty: true,
							});
						}}
					/>
					<Field.Text
						name="name"
						label={t('profile-name')}
						placeholder={t('profile-name-placeholder')}
						disabled={createProfile.isPending}
					/>
				</div>
				<p className="text-xs text-muted-foreground sm:pl-[68px]">
					{tProfiles('profile-icon-picker-hint')}
				</p>
			</div>
			<Field.Text
				name="description"
				label={t('description')}
				placeholder={t('profile-description-placeholder')}
				disabled={createProfile.isPending}
			/>
			<Field.CheckboxGroup
				name="permissions"
				label={t('permissions')}
				options={permissionOptions}
				isDisabled={createProfile.isPending}
			/>
			{methods.formState.errors.root?.server?.message ? (
				<p className="text-sm text-destructive" role="alert">
					{methods.formState.errors.root.server.message}
				</p>
			) : null}
			<div className="flex justify-end">
				<Button
					type="submit"
					variant="default"
					disabled={createProfile.isPending || permissionsQuery.isPending}
				>
					{t('create-profile')}
				</Button>
			</div>
		</Form>
	);
};

const NewStaffProfileRoute = () => {
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t, i18n } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);

	const resolver = useMemo(
		() => zodResolver(getNewStaffProfileSchema(getInterZodForI18n(i18n))),
		[i18n, i18n.language],
	);

	const methods = useForm<NewStaffProfileValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});

	// Nav guard: block while the draft is dirty. After a successful save we
	// re-arm the guard synchronously by clearing the dirty state
	// (`reset(undefined, { keepValues: true })`) BEFORE navigating, so there is
	// no window where a navigation could be wrongly blocked and no ref flag to
	// read during render (which made this component an optimization skip).
	const blocker = useBlocker({
		shouldBlockFn: () => methods.formState.isDirty,
		withResolver: true,
	});

	const permissionsQuery = useStaffPermissionCatalogQuery({
		language: i18n.language,
	});
	const createProfile = useCreateStaffProfileMutation();

	const permissionOptions = useMemo(
		() => buildStaffPermissionOptions(permissionsQuery.data?.additionalData),
		[permissionsQuery.data],
	);

	// Hoisted so the fatal-error gate reads a plain local, not a query flag.
	const permissionsError = permissionsQuery.error;
	if (
		shouldLogout ||
		(permissionsError !== null && shouldLogoutForFailure(permissionsError))
	) {
		return <LogoutRedirect />;
	}

	const onSubmit = methods.handleSubmit(async (values) => {
		methods.clearErrors('root');

		try {
			await createProfile.mutateAsync({
				name: values.name,
				description: values.description,
				permissions: values.permissions,
				emails: values.emails,
				icon: values.icon ? values.icon : null,
				tone: values.tone ? values.tone : null,
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const rootMessages: string[] = [];

				for (const [field, messages] of Object.entries(failure.fieldErrors)) {
					if (isStaffProfileFormField(field)) {
						methods.setError(field, {
							type: 'server',
							message: messages.join(' '),
						});
					} else {
						rootMessages.push(...messages);
					}
				}

				if (Object.keys(failure.fieldErrors).length === 0) {
					rootMessages.push(
						getFailureMessage(failure, {
							fallback: t('profile-save-failed'),
						}),
					);
				}

				if (rootMessages.length > 0) {
					methods.setError('root.server', {
						type: 'server',
						message: Array.from(new Set(rootMessages)).join(' '),
					});
				}
			}
			return;
		}

		await invalidateStaffProfiles(queryClient);
		// Re-arm the nav guard for the post-save navigation: clearing dirty
		// state is synchronous, so the blocker's shouldBlockFn (which reads
		// `methods.formState.isDirty` live at block time) sees a clean form.
		// We are navigating away, so dropping the saved draft's values is safe;
		// keeping them (`keepValues`) would leave them differing from the
		// defaults and RHF would immediately re-mark the form dirty again.
		methods.reset();
		void navigate({
			to: '/staff/profiles',
		});
	});

	return (
		<div
			className="mx-auto w-full max-w-4xl space-y-4"
			data-testid="staff-profile-create-page"
		>
			<div className="space-y-2">
				<Link to="/staff/profiles" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-staff-profiles')}
				</Link>
				<h1 className="text-xl font-semibold">
					{t('new-item', { item: t('profile').toLowerCase() })}
				</h1>
			</div>

			<Card className="space-y-4 p-4">
				<NewStaffProfileForm
					permissionsQuery={permissionsQuery}
					methods={methods}
					onSubmit={onSubmit}
					permissionOptions={permissionOptions}
				/>
			</Card>
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
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/profiles/new')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-staff-profiles', to: '/staff/profiles' },
			{ kind: 'label', labelKey: 'common:create-profile' },
		],
		// #980: the shared profile-style picker reads its labels from the
		// scope-neutral `staff-tenant-profiles` catalogue.
		i18nNamespaces: ['staff-tenant-profiles'],
	},
	component: NewStaffProfileRoute,
});
