import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Field, Form } from '~/components/field';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
	EntityHeaderSkeleton,
	FieldRowsSkeleton,
} from '~/components/ui/detail-skeleton';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { ErrorStateSurface } from '~/components/ui/state-surface';
import { LOCALE_LABELS, isSupportedLanguage } from '~/lib/i18n.shared';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	toAccountProfile,
	useAccountProfileQuery,
	useUpdateAccountProfileMutation,
	invalidateAccountProfileQuery,
	type AccountProfileUpdateInput,
} from '~/lib/query/tenant-account-profile';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	WorkspacePageHeader,
	ReadOnlyBadge,
	ReadOnlyFieldRow,
	ReadOnlyValue,
} from '../_workspace-page-parts';

/**
 * The tenant user's own profile, editable through the real tenant-scoped
 * PATCH endpoint (`/account/profile`). Identity fields (avatar, first/last
 * name) come from the tenant-scoped profile query and are writable; email is
 * not editable through this endpoint and stays read-only. Bio/language/
 * timezone still have no backend and keep the read-only affordance.
 */
const AccountProfilePage = () => {
	const { t, i18n } = useTranslation(['account', 'common']);
	const queryClient = useQueryClient();
	const tenantId = useResolvedWorkspaceTenantId();
	const query = useAccountProfileQuery(tenantId);
	const { refetch } = query;
	const profile = toAccountProfile(query.data);
	const updateProfile = useUpdateAccountProfileMutation();
	const [serverError, setServerError] = useState('');
	const [shouldLogout, setShouldLogout] = useState(false);

	const localeLabel = isSupportedLanguage(i18n.resolvedLanguage)
		? LOCALE_LABELS[i18n.resolvedLanguage]
		: undefined;
	const avatarSeed =
		profile?.displayName || profile?.email || t('common:un-named');

	const methods = useForm<AccountProfileValues>({
		resolver: zodResolver(getAccountProfileSchema(t)),
		defaultValues: {
			firstName: profile?.firstName ?? '',
			lastName: profile?.lastName ?? '',
			avatarUrl: profile?.avatarUrl ?? '',
			email: profile?.email ?? '',
		},
	});

	const {
		formState: { dirtyFields, isSubmitting },
		reset,
	} = methods;

	// `useForm` captures defaultValues at first render, when the query is still
	// unresolved (skeletons are showing), so the fields would otherwise stay
	// empty forever. Hydrate the form from the loaded query exactly once per
	// resolved tenant, mirroring the staff user-edit form idiom
	// ($userId-edit.tsx) — never on background refetches, and never over an
	// in-flight edit on the same tenant.
	const hydratedTenantIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			!query.isSuccess ||
			!profile ||
			hydratedTenantIdRef.current === tenantId
		) {
			return;
		}

		reset({
			firstName: profile.firstName ?? '',
			lastName: profile.lastName ?? '',
			avatarUrl: profile.avatarUrl ?? '',
			email: profile.email,
		});
		hydratedTenantIdRef.current = tenantId;
	}, [query.isSuccess, profile, tenantId, reset]);

	const isSubmittingForm = isSubmitting || updateProfile.isPending;

	const onSubmit = methods.handleSubmit(async (values) => {
		if (!tenantId) {
			return;
		}

		const updateInput: AccountProfileUpdateInput = { tenantId };
		if (dirtyFields.firstName) {
			updateInput.firstName = values.firstName.trim() || null;
		}
		if (dirtyFields.lastName) {
			updateInput.lastName = values.lastName.trim() || null;
		}
		if (dirtyFields.avatarUrl) {
			updateInput.avatarUrl = values.avatarUrl.trim() || null;
		}
		const hasChanges = Object.keys(updateInput).length > 1;

		if (!hasChanges) {
			return;
		}

		setServerError('');

		try {
			await updateProfile.mutateAsync(updateInput);
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
		// refetch so the header identity block shows the updated profile.
		for (const field of EDITABLE_FIELDS) {
			if (dirtyFields[field]) {
				methods.resetField(field, { defaultValue: values[field] });
			}
		}
		await invalidateAccountProfileQuery(queryClient, tenantId);
		toastLocalMutationResult.success(t('profile-updated-success'));
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-5" data-testid="tenant-account-profile-page">
			<WorkspacePageHeader titleKey="profile" />

			<QueryDisplay
				query={query}
				LoadingSlot={
					<Card>
						<CardHeader>
							<CardTitle>{t('personal-information')}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<EntityHeaderSkeleton
									tileClassName="size-14 rounded-[10px]"
									lines={['h-4 w-40', 'h-3 w-56']}
								/>
								<FieldRowsSkeleton count={3} />
							</div>
						</CardContent>
					</Card>
				}
				ErrorSlot={
					<Card>
						<CardHeader>
							<CardTitle>{t('personal-information')}</CardTitle>
						</CardHeader>
						<CardContent>
							<ErrorStateSurface
								icon={IconAlertCircle}
								title={t('failed-to-load-profile')}
								description={t('failed-to-load-profile-description')}
								testId="tenant-account-profile-error"
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
								<CardTitle>{t('personal-information')}</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="mb-5 flex items-center gap-4">
									<PersonAvatar
										name={avatarSeed}
										avatarUrl={profile?.avatarUrl}
										size="lg"
									/>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium text-foreground">
											{profile?.displayName ?? t('common:un-named')}
										</p>
										<p className="truncate text-xs text-muted-foreground">
											{profile?.email}
										</p>
									</div>
								</div>

								{serverError ? (
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
										<Field.Email
											name="email"
											label={t('common:email-address')}
											isDisabled
										/>
										<Field.Text
											name="avatarUrl"
											label={t('common:avatar-url')}
											placeholder="https://example.com/avatar.png"
											isDisabled={isSubmittingForm}
										/>
									</div>

									<div className="flex items-center gap-3 pt-2">
										<Button
											type="submit"
											variant="default"
											disabled={isSubmittingForm}
										>
											{t('save-changes')}
										</Button>
									</div>
								</Form>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>{t('preferences')}</CardTitle>
								<ReadOnlyBadge />
							</CardHeader>
							<CardContent className="space-y-1">
								<ReadOnlyFieldRow
									label={t('common:language')}
									description={t('language-description')}
								>
									<ReadOnlyValue>{localeLabel}</ReadOnlyValue>
								</ReadOnlyFieldRow>
								<ReadOnlyFieldRow
									label={t('timezone')}
									description={t('timezone-description')}
								>
									<ReadOnlyValue />
								</ReadOnlyFieldRow>
							</CardContent>
						</Card>
					</>
				)}
			</QueryDisplay>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/account/')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'account-settings', to: '/tenant/account' },
			{ kind: 'label', labelKey: 'profile' },
		],
		i18nNamespaces: ['account'],
	},
	component: AccountProfilePage,
});

const ALLOWED_AVATAR_URL_PROTOCOLS = ['http:', 'https:'];

const getAccountProfileSchema = (t: (key: string) => string) =>
	z.object({
		firstName: z.string().trim().max(128).or(z.literal('')),
		lastName: z.string().trim().max(128).or(z.literal('')),
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
			}, t('invalid-avatar-url')),
		// Read-only display field; never submitted to the PATCH endpoint.
		email: z.string().trim().pipe(z.email()).or(z.literal('')),
	});

type AccountProfileValues = z.infer<ReturnType<typeof getAccountProfileSchema>>;

const EDITABLE_FIELDS = ['firstName', 'lastName', 'avatarUrl'] as const;
