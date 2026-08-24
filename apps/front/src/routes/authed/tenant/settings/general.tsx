import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle, IconAlertTriangle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form, type FieldSelectOption } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { ErrorStateSurface, StateSurface } from '~/components/ui/state-surface';
import { LOCALE_LABELS } from '~/lib/i18n.shared';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	invalidateTenantSettingsGeneralQuery,
	toTenantSettingsGeneral,
	useTenantSettingsGeneralQuery,
	useUpdateTenantSettingsGeneralMutation,
	type TenantSettingsGeneralUpdateInput,
} from '~/lib/query/tenant-settings-general';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	isAbsoluteHttpUrl,
	isValidEmailAddress,
} from '../../staff/tenants/tenant-organization-profile-fields';
import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

/**
 * Workspace general settings, editable through the real tenant-scoped
 * endpoints (`GET/PATCH /settings/general`). Identity fields come from the
 * settings query and are writable; the danger zone still has no backend and
 * keeps the coming-later affordance.
 */
const TenantSettingsGeneralPage = () => {
	const { t } = useTranslation(['settings', 'common']);
	const queryClient = useQueryClient();
	const tenantId = useResolvedWorkspaceTenantId();
	const query = useTenantSettingsGeneralQuery(tenantId);
	const { refetch } = query;
	const settings = toTenantSettingsGeneral(query.data);
	const updateSettings = useUpdateTenantSettingsGeneralMutation();
	const [serverError, setServerError] = useState('');
	const [shouldLogout, setShouldLogout] = useState(false);

	const localeOptions: FieldSelectOption[] = useMemo(
		() => [
			{ value: '', label: t('common:not-set') },
			{ value: 'en', label: LOCALE_LABELS.en },
			{ value: 'fr', label: LOCALE_LABELS.fr },
		],
		[t],
	);

	const timezoneOptions: FieldSelectOption[] = useMemo(() => {
		const zones =
			typeof Intl.supportedValuesOf === 'function'
				? Intl.supportedValuesOf('timeZone')
				: [];

		return [
			{ value: '', label: t('common:not-set') },
			...zones.map((zone) => ({ value: zone, label: zone })),
		];
	}, [t]);

	const methods = useForm<SettingsGeneralValues>({
		resolver: zodResolver(getSettingsGeneralSchema(t)),
		defaultValues: {
			name: '',
			logoUrl: '',
			legalName: '',
			description: '',
			websiteUrl: '',
			billingEmail: '',
			supportEmail: '',
			defaultLocale: '',
			timezone: '',
		},
	});

	const {
		formState: { dirtyFields, isSubmitting },
		reset,
	} = methods;

	// `useForm` captures defaultValues at first render, when the query is still
	// unresolved (skeletons are showing), so the fields would otherwise stay
	// empty forever. Hydrate the form from the loaded query exactly once per
	// resolved tenant, mirroring the account profile page idiom — never on
	// background refetches, and never over an in-flight edit.
	const hydratedTenantIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			!query.isSuccess ||
			!settings ||
			hydratedTenantIdRef.current === tenantId
		) {
			return;
		}

		reset({
			name: settings.name,
			logoUrl: settings.logoUrl ?? '',
			legalName: settings.legalName ?? '',
			description: settings.description ?? '',
			websiteUrl: settings.websiteUrl ?? '',
			billingEmail: settings.billingEmail ?? '',
			supportEmail: settings.supportEmail ?? '',
			defaultLocale: settings.defaultLocale ?? '',
			timezone: settings.timezone ?? '',
		});
		hydratedTenantIdRef.current = tenantId;
	}, [query.isSuccess, settings, tenantId, reset]);

	const isSubmittingForm = isSubmitting || updateSettings.isPending;

	const onSubmit = methods.handleSubmit(async (values) => {
		if (!tenantId) {
			return;
		}

		const updateInput: TenantSettingsGeneralUpdateInput = { tenantId };
		if (dirtyFields.name) {
			updateInput.name = values.name;
		}
		if (dirtyFields.logoUrl) {
			updateInput.logoUrl = values.logoUrl.trim() || null;
		}
		if (dirtyFields.legalName) {
			updateInput.legalName = (values.legalName ?? '').trim() || null;
		}
		if (dirtyFields.description) {
			updateInput.description = (values.description ?? '').trim() || null;
		}
		if (dirtyFields.websiteUrl) {
			updateInput.websiteUrl = (values.websiteUrl ?? '').trim() || null;
		}
		if (dirtyFields.billingEmail) {
			updateInput.billingEmail = (values.billingEmail ?? '').trim() || null;
		}
		if (dirtyFields.supportEmail) {
			updateInput.supportEmail = (values.supportEmail ?? '').trim() || null;
		}
		if (dirtyFields.defaultLocale) {
			updateInput.defaultLocale = values.defaultLocale || null;
		}
		if (dirtyFields.timezone) {
			updateInput.timezone = values.timezone || null;
		}
		const hasChanges = Object.keys(updateInput).length > 1;

		if (!hasChanges) {
			return;
		}

		setServerError('');

		try {
			await updateSettings.mutateAsync(updateInput);
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
			await displayLocalMutationFailure(error, t('unknown-error'));
			return;
		}

		// The write is durable — mark only the committed fields clean at their
		// new values so a retry cannot resend already-saved values, then
		// refetch so the workspace header shows the updated values.
		for (const field of EDITABLE_FIELDS) {
			if (dirtyFields[field]) {
				methods.resetField(field, { defaultValue: values[field] });
			}
		}
		await invalidateTenantSettingsGeneralQuery(queryClient, tenantId);
		toastLocalMutationResult.success(t('settings-updated-success'));
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-5" data-testid="tenant-settings-general-page">
			<WorkspacePageHeader titleKey="general" />

			<QueryDisplay
				query={query}
				LoadingSlot={
					<>
						<Card>
							<CardHeader>
								<CardTitle>{t('common:organization-details')}</CardTitle>
							</CardHeader>
							<CardContent>
								<div
									className="space-y-4"
									data-testid="tenant-settings-general-skeleton"
								>
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('regional-and-contact-settings')}</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
									<Skeleton className="h-9 w-full" />
								</div>
							</CardContent>
						</Card>
					</>
				}
				ErrorSlot={
					<Card>
						<CardHeader>
							<CardTitle>{t('common:organization-details')}</CardTitle>
						</CardHeader>
						<CardContent>
							<ErrorStateSurface
								icon={IconAlertCircle}
								title={t('failed-to-load-settings')}
								description={t('failed-to-load-settings-description')}
								testId="tenant-settings-general-error"
								actions={
									<Button
										variant="default"
										type="button"
										onClick={() => void refetch()}
									>
										{t('common:retry')}
									</Button>
								}
							/>
						</CardContent>
					</Card>
				}
			>
				{() => (
					<>
						<Card>
							<CardHeader>
								<CardTitle>{t('common:organization-details')}</CardTitle>
							</CardHeader>
							<CardContent>
								{serverError !== '' ? (
									<p
										role="alert"
										className="mb-4 rounded-[var(--publy-radius-input)] bg-destructive/10 px-3 py-2 text-sm text-destructive"
									>
										{serverError}
									</p>
								) : null}

								<Form methods={methods} onSubmit={onSubmit}>
									<div className="grid gap-4 md:grid-cols-2">
										<Field.Text
											name="name"
											label={t('common:name')}
											placeholder={t('common:name')}
											isDisabled={isSubmittingForm}
										/>
										<Field.Text
											name="logoUrl"
											label={t('common:logo')}
											helperText={t('common:logo-description')}
											placeholder="https://example.com/logo.png"
											isDisabled={isSubmittingForm}
										/>
										<Field.Text
											name="legalName"
											label={t('common:legal-name')}
											placeholder={t('common:legal-name')}
											isDisabled={isSubmittingForm}
										/>
										<Field.Text
											name="websiteUrl"
											label={t('common:website')}
											placeholder="https://example.com"
											isDisabled={isSubmittingForm}
										/>
									</div>
									<Field.Textarea
										name="description"
										label={t('common:description')}
										placeholder={t('common:description')}
										isDisabled={isSubmittingForm}
									/>

									<div className="flex items-center gap-3 pt-2">
										<Button
											type="submit"
											variant="default"
											disabled={isSubmittingForm}
										>
											{t('common:save-changes')}
										</Button>
									</div>
								</Form>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('regional-and-contact-settings')}</CardTitle>
							</CardHeader>
							<CardContent>
								<Form methods={methods} onSubmit={onSubmit}>
									<div className="grid gap-4 md:grid-cols-2">
										<Field.Select
											name="defaultLocale"
											label={t('common:default-locale')}
											options={localeOptions}
											isDisabled={isSubmittingForm}
										/>
										<Field.Select
											name="timezone"
											label={t('common:timezone')}
											options={timezoneOptions}
											isDisabled={isSubmittingForm}
										/>
										<Field.Email
											name="billingEmail"
											label={t('common:billing-email')}
											placeholder="billing@example.com"
											isDisabled={isSubmittingForm}
										/>
										<Field.Email
											name="supportEmail"
											label={t('common:support-email')}
											placeholder="support@example.com"
											isDisabled={isSubmittingForm}
										/>
									</div>

									<div className="flex items-center gap-3 pt-2">
										<Button
											type="submit"
											variant="default"
											disabled={isSubmittingForm}
										>
											{t('common:save-changes')}
										</Button>
									</div>
								</Form>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('common:danger-zone')}</CardTitle>
								<ReadOnlyBadge />
							</CardHeader>
							<CardContent>
								<StateSurface
									icon={IconAlertTriangle}
									title={t('danger-zone-coming-later-title')}
									description={t('danger-zone-coming-later-description')}
									testId="tenant-settings-general-danger-empty"
								/>
							</CardContent>
						</Card>
					</>
				)}
			</QueryDisplay>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/settings/')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'general' },
		],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsGeneralPage,
});

const ALLOWED_LOGO_URL_PROTOCOLS = ['http:', 'https:'] as const;
const API_FILES_PREFIX = '/files/';

const getSettingsGeneralSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(5, { message: t('name-min-length') })
			.max(256, { message: t('name-max-length') }),
		logoUrl: z
			.string()
			.trim()
			.max(2048, { message: t('logo-url-max-length') })
			.refine((value) => {
				if (!value) {
					return true;
				}

				try {
					return ALLOWED_LOGO_URL_PROTOCOLS.includes(
						new URL(value)
							.protocol as (typeof ALLOWED_LOGO_URL_PROTOCOLS)[number],
					);
				} catch {
					// Root-relative served-upload paths are valid logo values.
					return value.startsWith(API_FILES_PREFIX);
				}
			}, t('invalid-logo-url')),
		legalName: z
			.string()
			.trim()
			.max(256, { message: t('legal-name-max-length') })
			.optional(),
		description: z
			.string()
			.trim()
			.max(1024, { message: t('description-max-length') })
			.optional(),
		websiteUrl: z
			.string()
			.trim()
			.max(2048, { message: t('website-max-length') })
			.optional()
			.refine((value) => !value || isAbsoluteHttpUrl(value), {
				message: t('invalid-website-url'),
			}),
		billingEmail: z
			.string()
			.trim()
			.max(320, { message: t('email-max-length') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('invalid-email'),
			}),
		supportEmail: z
			.string()
			.trim()
			.max(320, { message: t('email-max-length') })
			.optional()
			.refine((value) => !value || isValidEmailAddress(value), {
				message: t('invalid-email'),
			}),
		defaultLocale: z.string().optional(),
		timezone: z.string().optional(),
	});

type SettingsGeneralValues = z.infer<
	ReturnType<typeof getSettingsGeneralSchema>
>;

const EDITABLE_FIELDS = [
	'name',
	'logoUrl',
	'legalName',
	'description',
	'websiteUrl',
	'billingEmail',
	'supportEmail',
	'defaultLocale',
	'timezone',
] as const;
