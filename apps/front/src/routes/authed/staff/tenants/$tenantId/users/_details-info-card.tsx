import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui/card';

import {
	DetailItem,
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
} from '../_tenant-details-shell';

export const TenantUserInfoCard = ({
	userEmail,
	userAccountLevel,
	userStatus,
	userId,
	tenantId,
	avatarUrl,
}: {
	userEmail: string;
	userAccountLevel: string | null;
	userStatus: string | null;
	userId: string;
	tenantId: string;
	avatarUrl: string | null;
}) => {
	const { t } = useTranslation('common');

	return (
		<Card className="space-y-4 p-5">
			<div className="grid gap-4 md:grid-cols-2">
				<DetailItem label={t('email')} value={userEmail} />
				<DetailItem
					label={t('account-level')}
					value={formatTenantUserLevelLabel(userAccountLevel, t)}
				/>
				<DetailItem
					label={t('status')}
					value={formatTenantUserStatusLabel(userStatus, t)}
				/>
				<DetailItem label={t('user-id')} value={userId} />
				{/* W6-GUARDS (tests F7 / users-auth F11): the API's own
				`tenantId` is nullable in the response type, but this route is
				already scoped to a validated tenant via `Route.useParams()` —
				sourcing the display value from the ROUTE removes the fabricated
				'—' placeholder for a required identity field entirely, instead
				of tolerating a null API value. */}
				<DetailItem label={t('tenant-id')} value={tenantId} />
				{/* data-honesty-ignore: avatarUrl is a documented OPTIONAL field — a user with no uploaded avatar has none, this is not fabricated identity data */}
				<DetailItem label={t('avatar-url')} value={avatarUrl ?? '—'} />
			</div>
		</Card>
	);
};
