import { IconAlertCircle } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { Skeleton } from '~/components/ui/skeleton';
import { ErrorStateSurface } from '~/components/ui/state-surface';
import { LOCALE_LABELS, isSupportedLanguage } from '~/lib/i18n.shared';
import { toCurrentUser, useCurrentUserQuery } from '~/lib/query/auth';

import {
	WorkspacePageHeader,
	ReadOnlyBadge,
	ReadOnlyFieldRow,
	ReadOnlyValue,
} from '../_workspace-page-parts';

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

/**
 * Read-only port of old-front's account profile page. The identity fields
 * (avatar, first/last name, email) show the real signed-in user from the
 * session-scoped `useCurrentUserQuery`; bio/timezone have no API yet, so
 * they render as unavailable rather than inventing values. There is no
 * update mutation anywhere on this surface.
 */
function AccountProfilePage() {
	const { t, i18n } = useTranslation(['account', 'common']);
	const { data, isLoading, isError, refetch } = useCurrentUserQuery();
	const currentUser = toCurrentUser(data);

	const localeLabel = isSupportedLanguage(i18n.resolvedLanguage)
		? LOCALE_LABELS[i18n.resolvedLanguage]
		: undefined;
	const identityAvailable = !isLoading && !isError && currentUser !== null;
	const avatarSeed =
		currentUser?.displayName || currentUser?.email || t('common:un-named');

	return (
		<div className="space-y-5" data-testid="tenant-account-profile-page">
			<WorkspacePageHeader titleKey="profile" />

			{isError ? (
				<Card>
					<CardHeader>
						<CardTitle>{t('personal-information')}</CardTitle>
						<ReadOnlyBadge />
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
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>{t('personal-information')}</CardTitle>
							<ReadOnlyBadge />
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-4">
								{identityAvailable ? (
									<PersonAvatar
										name={avatarSeed}
										avatarUrl={currentUser?.avatarUrl}
										size="lg"
									/>
								) : (
									<Skeleton className="size-14 rounded-[10px]" />
								)}
								<div className="min-w-0">
									{isLoading ? (
										<div className="space-y-1.5">
											<Skeleton className="h-4 w-40" />
											<Skeleton className="h-3 w-56" />
										</div>
									) : (
										<>
											<p className="truncate text-sm font-medium text-foreground">
												{currentUser?.displayName ?? t('common:un-named')}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{currentUser?.email}
											</p>
										</>
									)}
								</div>
							</div>

							<div className="mt-4 space-y-1">
								<ReadOnlyFieldRow label={t('common:firstname')}>
									<ReadOnlyValue>{currentUser?.firstName}</ReadOnlyValue>
								</ReadOnlyFieldRow>
								<ReadOnlyFieldRow label={t('common:lastname')}>
									<ReadOnlyValue>{currentUser?.lastName}</ReadOnlyValue>
								</ReadOnlyFieldRow>
								<ReadOnlyFieldRow label={t('common:email')}>
									<ReadOnlyValue>{currentUser?.email}</ReadOnlyValue>
								</ReadOnlyFieldRow>
								<ReadOnlyFieldRow
									label={t('bio')}
									description={t('bio-description')}
								>
									<ReadOnlyValue />
								</ReadOnlyFieldRow>
							</div>
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
		</div>
	);
}
