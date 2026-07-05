import { Button, Card, Spinner } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { i18n as I18nInstance } from 'i18next';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import { FALLBACK_LANGUAGE, isSupportedLanguage } from '~/lib/i18n.shared';
import {
	STAFF_PROFILES_QUERY_KEY,
	type StaffPermissionCatalog,
	type StaffPermissionCatalogEntry,
	useCreateStaffProfileMutation,
	useStaffPermissionCatalogQuery,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

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

const DEFAULT_VALUES: NewStaffProfileValues = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
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

	if (typeof permission.name === 'string' && permission.name.length > 0) {
		segments.push(permission.name);
	}

	if (
		typeof permission.description === 'string' &&
		permission.description.length > 0
	) {
		segments.push(permission.description);
	}

	return segments.length > 0 ? segments.join(' • ') : undefined;
};

export const buildStaffPermissionOptions = (
	catalog: StaffPermissionCatalog | null | undefined,
): StaffPermissionOption[] => {
	const options: StaffPermissionOption[] = [];

	for (const [moduleKey, permissions] of Object.entries(catalog ?? {})) {
		for (const permission of Object.values(permissions)) {
			if (typeof permission.key !== 'string' || permission.key.length === 0) {
				continue;
			}

			options.push({
				value: permission.key,
				label: permission.key,
				description: buildPermissionDescription(moduleKey, permission),
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

export const Route = createFileRoute('/_authed-layout/staff/profiles-new')({
	component: NewStaffProfileRoute,
});

function NewStaffProfileRoute() {
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t, i18n } = useTranslation('common');
	const [serverError, setServerError] = useState('');

	const resolver = useMemo(
		() => zodResolver(getNewStaffProfileSchema(getInterZodForI18n(i18n))),
		[i18n, i18n.language],
	);

	const methods = useForm<NewStaffProfileValues>({
		resolver,
		defaultValues: DEFAULT_VALUES,
	});

	const permissionsQuery = useStaffPermissionCatalogQuery({
		language: i18n.language,
	});
	const createProfile = useCreateStaffProfileMutation();

	const permissionOptions = useMemo(
		() =>
			buildStaffPermissionOptions(
				(permissionsQuery.data?.additionalData ?? undefined) as
					| StaffPermissionCatalog
					| undefined,
			),
		[permissionsQuery.data],
	);

	if (
		permissionsQuery.isError &&
		shouldLogoutForFailure(permissionsQuery.error)
	) {
		return <LogoutRedirect />;
	}

	const onSubmit = methods.handleSubmit(async (values) => {
		setServerError('');

		try {
			await createProfile.mutateAsync({
				name: values.name,
				description: values.description,
				permissions: values.permissions,
				emails: values.emails,
			});
			await queryClient.invalidateQueries({
				queryKey: STAFF_PROFILES_QUERY_KEY,
			});
			void navigate({
				to: '/staff/profiles',
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				return;
			}

			setServerError(
				getFailureMessage(toApiFailure(error), {
					fallback: t('profile-save-failed'),
				}),
			);
		}
	});

	return (
		<div
			className="mx-auto w-full max-w-4xl space-y-4 p-4"
			data-testid="staff-profile-create-page"
		>
			<div className="space-y-2">
				<Link
					to="/staff/profiles"
					className="text-sm underline-offset-4 hover:underline"
				>
					{t('back-to-staff-profiles')}
				</Link>
				<h1 className="text-xl font-semibold">
					{t('new-item', { item: t('profile').toLowerCase() })}
				</h1>
			</div>

			<Card className="space-y-4 p-4">
				{permissionsQuery.isPending ? (
					<div className="flex items-center gap-3 py-8 text-sm text-foreground-500">
						<Spinner size="sm" />
						<span>Loading permissions...</span>
					</div>
				) : permissionsQuery.isError ? (
					<div className="space-y-3">
						<p className="text-sm text-danger-600">
							{getFailureMessage(toApiFailure(permissionsQuery.error), {
								fallback: t('unable-to-load-staff-permissions'),
							})}
						</p>
						<Button
							type="button"
							variant="secondary"
							onPress={() => void permissionsQuery.refetch()}
						>
							Retry
						</Button>
					</div>
				) : (
					<Form methods={methods} onSubmit={onSubmit}>
						<Field.Text
							name="name"
							label={t('profile-name')}
							placeholder="Platform admin"
							disabled={createProfile.isPending}
						/>
						<Field.Text
							name="description"
							label={t('description')}
							placeholder="Describe the responsibilities for this profile"
							disabled={createProfile.isPending}
						/>
						<Field.CheckboxGroup
							name="permissions"
							label={t('permissions')}
							options={permissionOptions}
							isDisabled={createProfile.isPending}
						/>
						{serverError ? (
							<p className="text-sm text-danger-600">{serverError}</p>
						) : null}
						<div className="flex justify-end">
							<Button
								type="submit"
								variant="primary"
								isDisabled={
									createProfile.isPending || permissionsQuery.isPending
								}
							>
								{t('create-profile')}
							</Button>
						</div>
					</Form>
				)}
			</Card>
		</div>
	);
}
