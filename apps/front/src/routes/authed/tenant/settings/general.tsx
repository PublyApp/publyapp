import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { FieldRowsSkeleton } from '~/components/ui/detail-skeleton';
import { ErrorStateSurface } from '~/components/ui/state-surface';
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

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { WorkspacePageHeader } from '../_workspace-page-parts';
import { SettingsGeneralDangerCard } from './_settings-general-danger-card';
import { SettingsGeneralIdentityCard } from './_settings-general-identity-card';
import { SettingsGeneralRegionalCard } from './_settings-general-regional-card';
import {
	EDITABLE_FIELDS,
	getSettingsGeneralSchema,
	type SettingsGeneralValues,
} from './_settings-general-schema';

// Static skeletons — module-level so they are built once, not per render
// (react-doctor/rendering-hoist-jsx).
const IDENTITY_LOADING_SLOT = (
	<div data-testid="tenant-settings-general-skeleton">
		<FieldRowsSkeleton count={5} />
	</div>
);

const REGIONAL_LOADING_SLOT = <FieldRowsSkeleton count={4} />;

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
	const { data, isSuccess, refetch } = query;
	const settings = toTenantSettingsGeneral(data);
	const updateSettings = useUpdateTenantSettingsGeneralMutation();
	const [serverError, setServerError] = useState('');
	const [shouldLogout, setShouldLogout] = useState(false);

	const localeOptions = useMemo(
		() => [
			{ value: '', label: t('common:not-set') },
			{ value: 'en', label: LOCALE_LABELS.en },
			{ value: 'fr', label: LOCALE_LABELS.fr },
		],
		[t],
	);

	const timezoneOptions = useMemo(() => {
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
		if (!isSuccess || !settings || hydratedTenantIdRef.current === tenantId) {
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
	}, [isSuccess, settings, tenantId, reset]);

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

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// QueryDisplay owns the loading/error/data rendering below.
	const settingsError = query.error;
	if (settingsError !== null && shouldLogoutForFailure(settingsError)) {
		return <LogoutRedirect />;
	}

	const renderSettingsErrorSlot = (
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
	);

	return (
		<div className="space-y-5" data-testid="tenant-settings-general-page">
			<WorkspacePageHeader titleKey="general" />

			<QueryDisplay
				query={query}
				LoadingSlot={
					<>
						{IDENTITY_LOADING_SLOT}
						{REGIONAL_LOADING_SLOT}
					</>
				}
				ErrorSlot={renderSettingsErrorSlot}
			>
				{() => (
					<>
						<SettingsGeneralIdentityCard
							t={t}
							serverError={serverError}
							methods={methods}
							onSubmit={onSubmit}
							isSubmittingForm={isSubmittingForm}
						/>
						<SettingsGeneralRegionalCard
							t={t}
							methods={methods}
							onSubmit={onSubmit}
							isSubmittingForm={isSubmittingForm}
							localeOptions={localeOptions}
							timezoneOptions={timezoneOptions}
						/>
						<SettingsGeneralDangerCard t={t} />
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
