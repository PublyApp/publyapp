import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Switch } from '~/components/ui/switch';

import {
	WorkspacePageHeader,
	ReadOnlyBadge,
	ReadOnlyFieldRow,
} from '../_workspace-page-parts';

/**
 * Read-only port of old-front's account notifications page. Every preference
 * renders as a disabled switch (never pre-checked — there is no preferences
 * API to read real values from) with the read-only badge on the card.
 */
const AccountNotificationsPage = () => {
	const { t } = useTranslation(['account', 'common']);

	// Card titles/descriptions are translated HERE (not passed as keys to
	// renderCard) so the i18n-key-coverage guard sees the literals next to
	// `t(`; the `common:` qualification matches where the keys actually live.
	const renderCard = (
		title: string,
		description: string,
		preferences: readonly NotificationPreference[],
	) => (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<ReadOnlyBadge />
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">{description}</p>
				<div className="mt-2 space-y-1">
					{preferences.map((preference) => (
						<ReadOnlyFieldRow
							key={preference.labelKey}
							label={t(preference.labelKey)}
							description={t(preference.descriptionKey)}
						>
							<Switch disabled checked={false} />
						</ReadOnlyFieldRow>
					))}
				</div>
			</CardContent>
		</Card>
	);

	return (
		<div className="space-y-5" data-testid="tenant-account-notifications-page">
			<WorkspacePageHeader titleKey="notifications" />

			{renderCard(
				t('common:email-notifications'),
				t('common:manage-your-email-notification-preferences'),
				EMAIL_PREFERENCES,
			)}
			{renderCard(
				t('common:push-notifications'),
				t('common:manage-your-push-notification-preferences'),
				PUSH_PREFERENCES,
			)}
			{renderCard(
				t('common:activity-digest'),
				t('common:manage-your-activity-digest-preferences'),
				DIGEST_PREFERENCES,
			)}
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/tenant/account/notifications',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'account-settings', to: '/tenant/account' },
			{ kind: 'label', labelKey: 'notifications' },
		],
		i18nNamespaces: ['account'],
	},
	component: AccountNotificationsPage,
});

type NotificationPreference = {
	labelKey: string;
	descriptionKey: string;
};

// The preference LABELS resolve from the `common` bundle (i18next falls back
// across namespaces at render time, exactly like `security-alerts`); the
// `*-description` copy is account-surface-specific and lives in `account`.
// Nothing here may duplicate a key already declared in `common.json`.
const EMAIL_PREFERENCES: readonly NotificationPreference[] = [
	{
		labelKey: 'marketing-emails',
		descriptionKey: 'marketing-emails-description',
	},
	{
		labelKey: 'product-updates',
		descriptionKey: 'product-updates-description',
	},
	{
		labelKey: 'security-alerts',
		descriptionKey: 'security-alerts-description',
	},
];

const PUSH_PREFERENCES: readonly NotificationPreference[] = [
	{ labelKey: 'new-messages', descriptionKey: 'new-messages-description' },
	{ labelKey: 'mentions', descriptionKey: 'mentions-description' },
	{ labelKey: 'comments', descriptionKey: 'comments-description' },
];

const DIGEST_PREFERENCES: readonly NotificationPreference[] = [
	{ labelKey: 'weekly-digest', descriptionKey: 'weekly-digest-description' },
	{
		labelKey: 'monthly-report',
		descriptionKey: 'monthly-report-description',
	},
];
