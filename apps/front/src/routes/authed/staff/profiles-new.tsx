import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import type { i18n as I18nInstance } from 'i18next';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { FALLBACK_LANGUAGE, isSupportedLanguage } from '~/lib/i18n.shared';
import {
	invalidateStaffProfiles,
	type StaffPermissionCatalogEntry,
	useCreateStaffProfileMutation,
	useStaffPermissionCatalogQuery,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import InterZod from '@org/shared-ts/lib/zod/InterZod';
import { getNewStaffProfileSchema } from '@org/shared-ts/validations/staff-profile.validations';

type NewStaffProfileValues = z.infer<
	ReturnType<typeof getNewStaffProfileSchema>
>;

type StaffPermissionOption = {
	value: string;
	label: string;
	description?: string;
};

type InterZodOptions = ConstructorParameters<typeof InterZod>[0];
type InterZodI18nLike = InterZodOptions['i18n'];

const STAFF_PROFILE_FORM_FIELDS = [
	'name',
	'description',
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
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const normalizeOptionalString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const formatModuleLabel = (moduleKey: string): string =>
	moduleKey
		.trim()
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (value) => value.toUpperCase());

const buildPermissionDescription = (
	moduleKey: string,
	permission: StaffPermissionCatalogEntry,
): string | undefined => {
	const segments = [formatModuleLabel(moduleKey)];
	const name = normalizeOptionalString(permission.name);
	const description = normalizeOptionalString(permission.description);

	if (name) {
		segments.push(name);
	}

	if (description) {
		segments.push(description);
	}

	return segments.length > 0 ? segments.join(' • ') : undefined;
};

export const buildStaffPermissionOptions = (
	catalog: unknown,
): StaffPermissionOption[] => {
	if (!isRecord(catalog)) {
		return [];
	}

	const options: StaffPermissionOption[] = [];

	for (const [moduleKey, permissions] of Object.entries(catalog)) {
		if (!isRecord(permissions)) {
			continue;
		}

		for (const permission of Object.values(permissions)) {
			if (!isRecord(permission)) {
				continue;
			}

			const key = normalizeOptionalString(permission.key);
			if (!key) {
				continue;
			}

			const entry: StaffPermissionCatalogEntry = {
				key,
				name: normalizeOptionalString(permission.name),
				description: normalizeOptionalString(permission.description),
			};

			options.push({
				value: key,
				label: key,
				description: buildPermissionDescription(moduleKey, entry),
			});
		}
	}

	return [...options].sort((left, right) =>
		left.label.localeCompare(right.label),
	);
};

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

export const Route = createFileRoute('/_authed-layout/staff/profiles/new')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-staff-profiles', to: '/staff/profiles' },
			{ kind: 'label', labelKey: 'common:create-profile' },
		],
	},
	component: NewStaffProfileRoute,
});

function NewStaffProfileRoute() {
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t, i18n } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);
	const hasSavedRef = useRef(false);

	const resolver = useMemo(
		() => zodResolver(getNewStaffProfileSchema(getInterZodForI18n(i18n))),
		[i18n, i18n.language],
	);

	const methods = useForm<NewStaffProfileValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});

	const blocker = useBlocker({
		shouldBlockFn: () => methods.formState.isDirty && !hasSavedRef.current,
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

	if (
		shouldLogout ||
		(permissionsQuery.isError && shouldLogoutForFailure(permissionsQuery.error))
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
		hasSavedRef.current = true;
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
				{(() => {
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
							<Field.Text
								name="name"
								label={t('profile-name')}
								placeholder={t('profile-name-placeholder')}
								disabled={createProfile.isPending}
							/>
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
									disabled={
										createProfile.isPending || permissionsQuery.isPending
									}
								>
									{t('create-profile')}
								</Button>
							</div>
						</Form>
					);
				})()}
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
}
