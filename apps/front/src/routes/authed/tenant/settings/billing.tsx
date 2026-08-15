import {
	IconCreditCard,
	IconGauge,
	IconReceipt,
	IconWallet,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/settings/billing')(
	{
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
				{ kind: 'label', labelKey: 'billing' },
			],
			i18nNamespaces: ['settings'],
		},
		component: TenantSettingsBillingPage,
	},
);

/**
 * Read-only org billing settings: the plan, payment method, billing history
 * and usage surfaces are all honest coming-later states — no billing API
 * exists, so there is no fake pricing, no mock invoices, and no disabled
 * button that pretends to work.
 */
function TenantSettingsBillingPage() {
	const { t } = useTranslation(['settings', 'common']);

	return (
		<div className="space-y-5" data-testid="tenant-settings-billing-page">
			<WorkspacePageHeader titleKey="billing" />

			<Card>
				<CardHeader>
					<CardTitle>{t('common:current-plan')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconCreditCard}
						title={t('current-plan-coming-later-title')}
						description={t('current-plan-coming-later-description')}
						testId="tenant-settings-current-plan-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:payment-method')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconWallet}
						title={t('payment-method-coming-later-title')}
						description={t('payment-method-coming-later-description')}
						testId="tenant-settings-payment-method-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:billing-history')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconReceipt}
						title={t('billing-history-coming-later-title')}
						description={t('billing-history-coming-later-description')}
						testId="tenant-settings-billing-history-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:usage')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconGauge}
						title={t('usage-coming-later-title')}
						description={t('usage-coming-later-description')}
						testId="tenant-settings-usage-empty"
					/>
				</CardContent>
			</Card>
		</div>
	);
}
