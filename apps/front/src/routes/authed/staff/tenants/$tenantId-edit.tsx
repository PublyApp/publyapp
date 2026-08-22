import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	Field,
	Form,
	FormActionBar,
	FormPageLayout,
	type FieldSelectOption,
} from '~/components/field';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { BrandTile } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	invalidateStaffTenants,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
	useUpdateStaffTenantMutation,
	type StaffTenantUpdateInput,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	formatShortDate,
	formatTenantStatusLabel,
	getRelativeTimeParts,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantRetryActions,
} from './$tenantId/_tenant-details-shell';
import {
	getWebsiteHostname,
	isAbsoluteHttpUrl,
	isValidEmailAddress,
} from './tenant-organization-profile-fields';

const buildEditTenantSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(5, { message: t('tenant-name-too-short') })
			.max(256, { message: t('tenant-name-too-long') })
			.optional(),
		maxUsers: z.coerce
			.number({ invalid_type_error: t('seats-required') })
			.int()
			.positive({ message: t('seats-must-be-positive') }),
		logoUrl: z
			.string()
			.trim()
			.max(2048, { message: t('logo-url-too-long') })
			.optional(),
		legalName: z
			.string()
			.trim()
			.max(256, { message: t('legal-name-too-long') })
			.optional(),
		description: z
			.string()
			.trim()
			.max(1024, { message: t('description-too-long') })
			.optional(),
		websiteUrl: z
			.string()
			.trim()
			.max(2048, { message: t('website-url-too-long') })
			.optional()
			.refine((value) => !value || isAbsoluteHttpUrl(value), {
				message: t('website-url-invalid'),
			}),
		billingEmail: z
			.string()
			.trim()
			.max(320, { message: t('billing-email-too-long') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('invalid-email-address'),
			}),
		supportEmail: z
			.string()
			.trim()
			.max(320, { message: t('support-email-too-long') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('invalid-email-address'),
			}),
		defaultLocale: z.string().trim().optional(),
		timezone: z.string().trim().optional(),
		notes: z
			.string()
			.trim()
			.max(4000, { message: t('notes-too-long') })
			.optional(),
	});

type EditTenantFormValues = z.infer<ReturnType<typeof buildEditTenantSchema>>;

const EMPTY_FORM_VALUES: EditTenantFormValues = {
	name: '',
	maxUsers: 1,
	logoUrl: '',
	legalName: '',
	description: '',
	websiteUrl: '',
	billingEmail: '',
	supportEmail: '',
	defaultLocale: '',
	timezone: '',
	notes: '',
};

const TENANT_EDIT_FORM_FIELDS = new Set<keyof EditTenantFormValues>([
	'name',
	'maxUsers',
	'logoUrl',
	'legalName',
	'description',
	'websiteUrl',
	'billingEmail',
	'supportEmail',
	'defaultLocale',
	'timezone',
	'notes',
]);

const isTenantEditFormField = (
	field: string,
): field is keyof EditTenantFormValues =>
	TENANT_EDIT_FORM_FIELDS.has(field as keyof EditTenantFormValues);

const normalizeOptionalUpdateString = (
	value: string | undefined,
): string | null | undefined => {
	const trimmed = value?.trim();
	if (trimmed === undefined) {
		return undefined;
	}

	return trimmed.length > 0 ? trimmed : null;
};

/** Read-only twin of the create form's SlugField: same bordered container and
 * `publyapp.com/` prefix, but the slug is server-assigned and immutable. */
const ReadOnlySlugField = ({
	code,
	label,
	hint,
}: {
	code: string;
	label: string;
	hint: string;
}) => (
	<div className="space-y-1.5">
		<span className="flex items-center gap-2 text-[13px] leading-none font-medium">
			{label}
		</span>
		<div className="flex h-9 items-center gap-0 rounded-[var(--publy-radius-input)] border border-border bg-input/35 px-3.5 opacity-70 shadow-[var(--publy-shadow-input)]">
			<span className="shrink-0 font-mono text-[13px] text-muted-foreground">
				publyapp.com/
			</span>
			<span
				className="min-w-0 flex-1 truncate font-mono text-[13px]"
				data-testid="edit-tenant-slug"
			>
				{code}
			</span>
		</div>
		<p data-slot="field-helper" className="publy-field-helper">
			{hint}
		</p>
	</div>
);

const StaffTenantEditRoute = () => {
	const { tenantId } = Route.useParams() as { tenantId: string };
	const { t, i18n } = useTranslation('common');
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const [shouldLogout, setShouldLogout] = useState(false);
	const hasSavedRef = useRef(false);
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const updateTenant = useUpdateStaffTenantMutation();
	const tenant = toStaffTenantDetails(detailsQuery.data);
	const tenantFormValues = useMemo<EditTenantFormValues | null>(
		() =>
			tenant === null
				? null
				: {
						name: tenant.name,
						maxUsers: tenant.maxUsers,
						logoUrl: tenant.logoUrl ?? '',
						legalName: tenant.legalName ?? '',
						description: tenant.description ?? '',
						websiteUrl: tenant.websiteUrl ?? '',
						billingEmail: tenant.billingEmail ?? '',
						supportEmail: tenant.supportEmail ?? '',
						defaultLocale: tenant.defaultLocale ?? '',
						timezone: tenant.timezone ?? '',
						notes: tenant.notes ?? '',
					},
		[
			tenant?.id,
			tenant?.name,
			tenant?.maxUsers,
			tenant?.logoUrl,
			tenant?.legalName,
			tenant?.description,
			tenant?.websiteUrl,
			tenant?.billingEmail,
			tenant?.supportEmail,
			tenant?.defaultLocale,
			tenant?.timezone,
			tenant?.notes,
		],
	);

	const resolver = useMemo(
		() => zodResolver(buildEditTenantSchema(t)),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on language change so messages stay localized
		[i18n.language],
	);

	const methods = useForm<EditTenantFormValues>({
		resolver,
		defaultValues: EMPTY_FORM_VALUES,
	});
	const {
		formState: { dirtyFields, isDirty, isSubmitting },
		control,
		handleSubmit,
		reset,
	} = methods;
	const isPending = isSubmitting || updateTenant.isPending;
	const watchedName = useWatch({ control, name: 'name' }) ?? '';
	const watchedMaxUsers = useWatch({ control, name: 'maxUsers' });
	const watchedLogoUrl = useWatch({ control, name: 'logoUrl' }) ?? '';
	const watchedWebsiteUrl = useWatch({ control, name: 'websiteUrl' }) ?? '';

	const blocker = useBlocker({
		shouldBlockFn: () => isDirty && !hasSavedRef.current,
		withResolver: true,
	});

	const localeOptions: FieldSelectOption[] = useMemo(
		() => [
			{ value: '', label: t('not-set') },
			{ value: 'en', label: 'English' },
			{ value: 'fr', label: 'Français' },
		],
		[t],
	);

	const timezoneOptions: FieldSelectOption[] = useMemo(() => {
		const zones =
			typeof Intl.supportedValuesOf === 'function'
				? Intl.supportedValuesOf('timeZone')
				: [];

		return [
			{ value: '', label: t('not-set') },
			...zones.map((zone) => ({ value: zone, label: zone })),
		];
	}, [t]);

	useEffect(() => {
		if (tenantFormValues === null) {
			return;
		}

		// keepDirtyValues preserves any field the user has already edited while
		// still applying server changes to fields that are still pristine — a
		// plain reset() would silently overwrite in-progress edits on every
		// background refetch (r5-tenants-F2).
		reset(tenantFormValues, { keepDirtyValues: true });
	}, [reset, tenantFormValues]);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	if (detailsQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (detailsQuery.isError) {
		if (shouldLogoutForFailure(detailsQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
				testId="staff-tenant-edit-not-found"
				actions={
					<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
				}
			/>
		);
	}

	const onSubmit = handleSubmit(async (values) => {
		const payload: StaffTenantUpdateInput = { tenantId };

		if (dirtyFields.name && values.name !== undefined) {
			const name = values.name.trim();
			if (name.length > 0) {
				payload.name = name;
			}
		}

		if (dirtyFields.maxUsers) {
			payload.maxUsers = values.maxUsers;
		}

		if (dirtyFields.logoUrl) {
			payload.logoUrl = normalizeOptionalUpdateString(values.logoUrl);
		}

		if (dirtyFields.legalName) {
			payload.legalName = normalizeOptionalUpdateString(values.legalName);
		}

		if (dirtyFields.description) {
			payload.description = normalizeOptionalUpdateString(values.description);
		}

		if (dirtyFields.websiteUrl) {
			payload.websiteUrl = normalizeOptionalUpdateString(values.websiteUrl);
		}

		if (dirtyFields.billingEmail) {
			payload.billingEmail = normalizeOptionalUpdateString(values.billingEmail);
		}

		if (dirtyFields.supportEmail) {
			payload.supportEmail = normalizeOptionalUpdateString(values.supportEmail);
		}

		if (dirtyFields.defaultLocale) {
			payload.defaultLocale = normalizeOptionalUpdateString(
				values.defaultLocale,
			);
		}

		if (dirtyFields.timezone) {
			payload.timezone = normalizeOptionalUpdateString(values.timezone);
		}

		if (dirtyFields.notes) {
			payload.notes = normalizeOptionalUpdateString(values.notes);
		}

		try {
			methods.clearErrors('root.server');
			await updateTenant.mutateAsync(payload);
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				const rootMessages: string[] = [];
				let mappedFieldCount = 0;

				for (const [field, messages] of Object.entries(failure.fieldErrors)) {
					if (isTenantEditFormField(field) && messages.length > 0) {
						mappedFieldCount += 1;
						methods.setError(field, {
							type: 'server',
							message: messages.join(' '),
						});
						continue;
					}

					rootMessages.push(...messages);
				}

				if (mappedFieldCount === 0 && rootMessages.length === 0) {
					rootMessages.push(
						getFailureMessage(failure, {
							fallback: t('tenant-update-failed'),
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

		await invalidateStaffTenants(queryClient);
		hasSavedRef.current = true;
		void navigate({
			to: '/staff/tenants/$tenantId',
			params: { tenantId },
		});
	});

	const previewName = watchedName.trim().length > 0 ? watchedName : tenant.name;
	const parsedWatchedMaxUsers = Number(watchedMaxUsers);
	const previewMaxUsers =
		Number.isFinite(parsedWatchedMaxUsers) && parsedWatchedMaxUsers > 0
			? parsedWatchedMaxUsers
			: tenant.maxUsers;
	const previewLogoUrl =
		watchedLogoUrl.trim().length > 0 ? watchedLogoUrl.trim() : null;
	const previewWebsiteHostname = getWebsiteHostname(watchedWebsiteUrl);

	const seatMeterPercent =
		previewMaxUsers > 0
			? Math.min((tenant.usersCount / previewMaxUsers) * 100, 100)
			: 0;
	const isBelowCurrentUsers = previewMaxUsers < tenant.usersCount;

	const formatLastActive = (value: Date | null): string => {
		const parts = getRelativeTimeParts(value);
		// data-honesty-ignore: relative-time "never active" fallback, not a fabricated identity
		return parts ? t(parts.key, { count: parts.count }) : '—';
	};

	return (
		<FormPageLayout width={960} data-testid="staff-tenant-edit-page">
			<div className="space-y-2">
				<Link
					to="/staff/tenants/$tenantId"
					params={{ tenantId }}
					className="publy-back-link"
				>
					<IconArrowLeft aria-hidden="true" className="size-3" />
					{t('back-to-tenant')}
				</Link>
				<h1 className="text-xl font-semibold tracking-[-0.01em]">
					{t('edit-item', { item: t('tenant') })}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t('edit-tenant-description')}
				</p>
			</div>

			<Form methods={methods} onSubmit={onSubmit}>
				{methods.formState.errors.root?.server?.message ? (
					<p className="text-sm text-destructive" role="alert">
						{methods.formState.errors.root.server.message}
					</p>
				) : null}
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:gap-9">
					<div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
						<section className="flex flex-col gap-4">
							<p className="publy-type-eyebrow">{t('organization')}</p>
							<Field.Text
								name="name"
								label={t('organization-name')}
								fullWidth
								isDisabled={isPending}
							/>
							<div className="grid grid-cols-[1fr_128px] items-start gap-3">
								<ReadOnlySlugField
									// data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data
									code={tenant.code ?? '—'}
									label={t('workspace-slug')}
									hint={t('workspace-slug-immutable-hint')}
								/>
								<div className="flex flex-col gap-1.5">
									<Field.Text
										name="maxUsers"
										type="number"
										min={1}
										label={t('seats')}
										isDisabled={isPending}
									/>
									<div className="publy-stat-meter">
										<div
											className="publy-stat-meter-fill"
											style={{ width: `${seatMeterPercent}%` }}
										/>
									</div>
								</div>
							</div>
							{isBelowCurrentUsers ? (
								<p
									className="publy-field-helper text-(--publy-chip-pending-text)"
									data-testid="edit-tenant-seats-warning"
								>
									<IconAlertCircle aria-hidden="true" />
									{t('seats-below-current-members-warning', {
										count: tenant.usersCount,
									})}
								</p>
							) : null}
							<Field.ImageUpload
								name="logoUrl"
								label={t('logo')}
								previewName={previewName}
								isDisabled={isPending}
							/>
						</section>

						<section className="flex flex-col gap-4">
							<p className="publy-type-eyebrow">{t('identity')}</p>
							<Field.Text
								name="legalName"
								label={t('legal-name')}
								fullWidth
								isDisabled={isPending}
							/>
							<Field.Textarea
								name="description"
								label={t('description')}
								rows={3}
								isDisabled={isPending}
							/>
							<Field.Text
								name="websiteUrl"
								label={t('website-url')}
								placeholder="https://example.com"
								fullWidth
								isDisabled={isPending}
							/>
						</section>

						<section className="flex flex-col gap-4">
							<p className="publy-type-eyebrow">{t('contact')}</p>
							<div className="grid grid-cols-2 gap-3">
								<Field.Email
									name="billingEmail"
									label={t('billing-email')}
									isDisabled={isPending}
								/>
								<Field.Email
									name="supportEmail"
									label={t('support-email')}
									isDisabled={isPending}
								/>
							</div>
						</section>

						<section className="flex flex-col gap-4">
							<p className="publy-type-eyebrow">{t('regional')}</p>
							<div className="grid grid-cols-2 gap-3">
								<Field.Select
									name="defaultLocale"
									label={t('default-locale')}
									options={localeOptions}
									isDisabled={isPending}
								/>
								<Field.Select
									name="timezone"
									label={t('timezone')}
									options={timezoneOptions}
									isDisabled={isPending}
								/>
							</div>
						</section>

						<section className="flex flex-col gap-2 rounded-[var(--publy-radius-medium-control)] border border-(--publy-alert-warning-border) bg-(--publy-alert-warning-bg) p-4">
							<Field.Textarea
								name="notes"
								label={t('internal-notes')}
								helperText={t('internal-notes-hint')}
								rows={4}
								isDisabled={isPending}
							/>
						</section>
					</div>

					<aside className="order-1 lg:order-2">
						<div className="lg:sticky lg:top-5">
							<Card
								className="gap-0 py-0"
								data-testid="staff-tenant-edit-preview"
							>
								<div className="publy-card-header">
									<span className="publy-type-eyebrow">{t('preview')}</span>
								</div>

								<div className="flex items-center gap-3 px-[18px] py-4">
									<BrandTile
										name={previewName}
										logoUrl={previewLogoUrl}
										className="size-11 rounded-[12px] text-base"
									/>
									<div className="min-w-0">
										<p className="truncate text-[15px] font-semibold text-foreground">
											{previewName}
										</p>
										<p className="publy-tenant-identity-meta">
											<span className="publy-tenant-identity-meta-prefix">
												publyapp.com/
											</span>
											{/* data-honesty-ignore: tenant code is a documented OPTIONAL field — a tenant without an assigned workspace slug has none, this is not fabricated identity data */}
											<span>{tenant.code ?? '—'}</span>
										</p>
										{previewWebsiteHostname ? (
											<p className="truncate text-xs text-muted-foreground">
												{previewWebsiteHostname}
											</p>
										) : null}
									</div>
								</div>

								<div className="mx-[18px] h-px bg-(--publy-row-border)" />

								<div className="flex flex-col divide-y divide-(--publy-row-border) px-[18px]">
									<div className="flex items-center justify-between py-2.5 text-[13px]">
										<span className="text-muted-foreground">{t('status')}</span>
										<StatusPill tone={statusPillTone(tenant.status)}>
											{tenant.status
												? formatTenantStatusLabel(tenant.status, t)
												: t('unknown')}
										</StatusPill>
									</div>
									<div className="flex items-center justify-between py-2.5 text-[13px]">
										<span className="text-muted-foreground">{t('seats')}</span>
										<span
											className="font-medium text-foreground"
											data-testid="edit-preview-seats"
										>
											{tenant.usersCount} / {previewMaxUsers}
										</span>
									</div>
									<div className="flex items-center justify-between py-2.5 text-[13px]">
										<span className="text-muted-foreground">{t('owners')}</span>
										<span
											className="font-medium text-foreground"
											data-testid="edit-preview-owners"
										>
											{tenant.ownersCount}
										</span>
									</div>
									<div className="flex items-center justify-between py-2.5 text-[13px]">
										<span className="text-muted-foreground">
											{t('members')}
										</span>
										<span
											className="font-medium text-foreground"
											data-testid="edit-preview-members"
										>
											{tenant.usersCount}
										</span>
									</div>
								</div>
							</Card>
							<div
								className="mt-3 flex flex-col gap-1 text-[13px] text-muted-foreground"
								data-testid="edit-tenant-metadata"
							>
								<p>
									{t('created')}:{' '}
									{formatShortDate(tenant.createdAt, i18n.language)}
								</p>
								<p>
									{t('updated')}:{' '}
									{formatShortDate(tenant.updatedAt, i18n.language)}
								</p>
								<p>
									{t('last-active')}: {formatLastActive(tenant.lastActivityAt)}
								</p>
							</div>
						</div>
					</aside>
				</div>

				<FormActionBar
					status={
						isDirty ? (
							<span data-testid="edit-tenant-dirty-hint">
								{t('unsaved-changes')}
							</span>
						) : undefined
					}
				>
					{isDirty ? (
						<Button
							type="button"
							variant="ghost"
							disabled={isPending}
							onClick={() => {
								if (tenantFormValues) {
									reset(tenantFormValues);
								}
							}}
						>
							{t('reset-to-saved')}
						</Button>
					) : null}
					<Button
						type="button"
						variant="ghost"
						disabled={isPending}
						onClick={() => {
							void navigate({
								to: '/staff/tenants/$tenantId',
								params: { tenantId },
							});
						}}
					>
						{t('cancel')}
					</Button>
					<Button type="submit" disabled={isPending || !isDirty}>
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

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/edit',
)({
	staticData: {
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{ kind: 'label', labelKey: 'common:edit' },
		],
	},
	component: StaffTenantEditRoute,
});
