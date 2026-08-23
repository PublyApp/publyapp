import { IconShieldLock } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import {
	WorkspacePageHeader,
	ReadOnlyBadge,
	ReadOnlyFieldRow,
	ReadOnlyValue,
} from '../_workspace-page-parts';

/**
 * Read-only port of old-front's account security page: password change and
 * two-factor cards render their fields disabled, and the active-sessions
 * surface shows an honest coming-later state (session management has no API
 * yet). No fake mutations anywhere.
 */
const AccountSecurityPage = () => {
	const { t } = useTranslation(['account', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-account-security-page">
			<WorkspacePageHeader titleKey="security" />

			<Card>
				<CardHeader>
					<CardTitle>{t('change-password')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<div className="space-y-1">
						<ReadOnlyFieldRow label={t('current-password')}>
							<ReadOnlyValue />
						</ReadOnlyFieldRow>
						<ReadOnlyFieldRow label={t('new-password')}>
							<ReadOnlyValue />
						</ReadOnlyFieldRow>
						<ReadOnlyFieldRow label={t('confirm-new-password')}>
							<ReadOnlyValue />
						</ReadOnlyFieldRow>
					</div>
					<div className="mt-4 flex justify-end">
						<Button type="button" disabled>
							{t('update-password')}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('two-factor-authentication')}</CardTitle>
					<Badge variant="outline">
						{t('two-factor-authentication-status')}
					</Badge>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						{t('two-factor-authentication-description')}
					</p>
					<div className="mt-4 flex justify-end">
						<Button variant="outline" type="button" disabled>
							{t('enable-two-factor-authentication')}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('active-sessions')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconShieldLock}
						title={t('active-sessions-coming-later-title')}
						description={t('active-sessions-coming-later-description')}
						testId="tenant-account-sessions-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/tenant/account/security')(
	{
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'account-settings', to: '/tenant/account' },
				{ kind: 'label', labelKey: 'security' },
			],
			i18nNamespaces: ['account'],
		},
		component: AccountSecurityPage,
	},
);
