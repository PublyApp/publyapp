import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import type { i18n as I18nInstance } from 'i18next';
import { useMemo, useState } from 'react';
import { useWatch, useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { IconColorPicker } from '~/components/ui/icon-color-picker';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
	invalidateStaffRoles,
	useCreateStaffRoleMutation,
	useStaffPermissionCatalogQuery,
} from '~/lib/query/staff-roles';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import {
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
} from '@org/shared-ts/lib/i18n/shared';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';
import { createZodI18n } from '@org/shared-ts/lib/zod/zod-i18n';
import { getNewStaffRoleSchema } from '@org/shared-ts/validations/staff-role.validations';

import {
	buildStaffPermissionOptions,
	type StaffPermissionOption,
} from './_staff-permission-options';

type NewStaffRoleValues = z.infer<ReturnType<typeof getNewStaffRoleSchema>>;

const STAFF_ROLE_FORM_FIELDS = [
	'name',
	'description',
	'icon',
	'tone',
	'permissions',
	'emails',
] as const satisfies readonly (keyof NewStaffRoleValues)[];

const isStaffRoleFormField = (
	field: string,
): field is (typeof STAFF_ROLE_FORM_FIELDS)[number] =>
	STAFF_ROLE_FORM_FIELDS.some((candidate) => candidate === field);

const DEFAULT_VALUES: NewStaffRoleValues = {
	name: '',
	description: '',
	permissions: [],
	emails: [],
	icon: '',
	tone: '',
};

const getZodForI18n = (instance: I18nInstance) => {
	const locale = isSupportedLanguage(instance.language)
		? instance.language
		: FALLBACK_LANGUAGE;

	return createZodI18n({
		i18n: {
			getFixedT: instance.getFixedT.bind(instance),
			t: instance.t.bind(instance),
		},
		locale,
	});
};

const NewStaffRoleForm = ({
	query,
	methods,
	onSubmit,
	permissionOptions,
}: {
	query: ReturnType<typeof useStaffPermissionCatalogQuery>;
	methods: ReturnType<typeof useForm<NewStaffRoleValues>>;
	onSubmit: (event?: React.BaseSyntheticEvent) => void;
	permissionOptions: StaffPermissionOption[];
}) => {
	const { t } = useTranslation('common');
	const { t: tRoles } = useTranslation('staff-tenant-roles');
	const createRole = useCreateStaffRoleMutation();
	const icon = useWatch({ control: methods.control, name: 'icon' });
	const tone = useWatch({ control: methods.control, name: 'tone' });

	return (
		<QueryDisplay
			query={query}
			LoadingSlot={
				<div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
					<LoadingSpinner />
					<span>{t('loading-permissions')}</span>
				</div>
			}
			ErrorSlot={
				<div className="space-y-3">
					<p className="text-sm text-destructive">
						{getFailureMessage(toApiFailure(query.error), {
							fallback: t('unable-to-load-staff-permissions'),
						})}
					</p>
					<Button
						type="button"
						variant="secondary"
						onClick={() => void query.refetch()}
					>
						{t('retry')}
					</Button>
				</div>
			}
		>
			{() => (
				<Form methods={methods} onSubmit={onSubmit}>
					<div className="space-y-1.5">
						<div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
							<IconColorPicker
								value={{ icon, tone }}
								disabled={createRole.isPending}
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
								label={t('role-name')}
								placeholder={t('role-name-placeholder')}
								disabled={createRole.isPending}
							/>
						</div>
						<p className="text-xs text-muted-foreground sm:pl-[68px]">
							{tRoles('role-icon-picker-hint')}
						</p>
					</div>
					<Field.Text
						name="description"
						label={t('description')}
						placeholder={t('role-description-placeholder')}
						disabled={createRole.isPending}
					/>
					<Field.CheckboxGroup
						name="permissions"
						label={t('permissions')}
						options={permissionOptions}
						isDisabled={createRole.isPending}
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
							disabled={createRole.isPending || query.isPending}
						>
							{t('create-role')}
						</Button>
					</div>
				</Form>
			)}
		</QueryDisplay>
	);
};

const NewStaffRoleRoute = () => {
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const { t, i18n } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);

	// zodResolver keys its overload on the schema's concrete input type, which
	// the era-ed schema signature cannot carry; assert across the boundary in
	// two steps (one assertion per statement) instead of a chained cast.
	const resolver = useMemo(() => {
		const rawResolver: unknown = zodResolver(
			getNewStaffRoleSchema(getZodForI18n(i18n)),
		);
		return rawResolver as Resolver<NewStaffRoleValues>;
	}, [i18n, i18n.language]);

	const methods = useForm<NewStaffRoleValues>({
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
	const createRole = useCreateStaffRoleMutation();

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
			await createRole.mutateAsync({
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
					if (isStaffRoleFormField(field)) {
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
							fallback: t('role-save-failed'),
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

		await invalidateStaffRoles(queryClient);
		// Re-arm the nav guard for the post-save navigation: clearing dirty
		// state is synchronous, so the blocker's shouldBlockFn (which reads
		// `methods.formState.isDirty` live at block time) sees a clean form.
		// We are navigating away, so dropping the saved draft's values is safe;
		// keeping them (`keepValues`) would leave them differing from the
		// defaults and RHF would immediately re-mark the form dirty again.
		methods.reset();
		void navigate({
			to: '/staff/roles',
		});
	});

	return (
		<div
			className="mx-auto w-full max-w-4xl space-y-4"
			data-testid="staff-role-create-page"
		>
			<div className="space-y-2">
				<Link to="/staff/roles" className="publy-back-link">
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-staff-roles')}
				</Link>
				<h1 className="publy-type-page-title">
					{t('new-item', { item: t('role').toLowerCase() })}
				</h1>
			</div>

			<Card className="space-y-4 p-4">
				<NewStaffRoleForm
					query={permissionsQuery}
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

export const Route = createFileRoute('/_authed-layout/staff/roles/new')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-staff-roles', to: '/staff/roles' },
			{ kind: 'label', labelKey: 'common:create-role' },
		],
		// #980: the shared role-style picker reads its labels from the
		// scope-neutral `staff-tenant-roles` catalogue.
		i18nNamespaces: ['staff-tenant-roles'],
	},
	component: NewStaffRoleRoute,
});
