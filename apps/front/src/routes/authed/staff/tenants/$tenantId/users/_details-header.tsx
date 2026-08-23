import { IconArrowLeft } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const TenantUserDetailsHeader = ({
	displayName,
	email,
	tenantId,
	userId,
}: {
	displayName: string;
	email: string;
	tenantId: string;
	userId: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-2">
			<Link
				to="/staff/tenants/$tenantId/users"
				params={{ tenantId }}
				className="publy-back-link"
			>
				<IconArrowLeft aria-hidden="true" className="size-3" />
				{t('back-to-users')}
			</Link>
			<Link
				to="/staff/tenants/$tenantId/users/$userId/edit"
				params={{ tenantId, userId }}
				className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:text-foreground hover:underline"
			>
				{t('edit-tenant-user')}
			</Link>

			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					{displayName}
				</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					{email || t('no-email-available')}
				</p>
			</div>
		</div>
	);
};
