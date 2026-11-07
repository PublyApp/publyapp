import { useTranslation } from 'react-i18next';
import type { StaffPermissionCatalog } from '~/lib/query/staff-roles';

import { PermissionMatrix } from './_permission-matrix';

/** The staff-role detail page's permission card body: the protected system
 * role explains its implicit full access instead of showing an empty matrix. */
export const StaffRolePermissionsCardBody = ({
	isFullAccess,
	assignedKeys,
	catalog,
}: {
	isFullAccess?: boolean;
	assignedKeys: string[];
	catalog: StaffPermissionCatalog | undefined;
}) => {
	const { t } = useTranslation('common');

	if (isFullAccess) {
		return (
			<div
				className="px-[18px] py-6 text-[13px]"
				data-testid="staff-role-full-access-note"
			>
				<p className="font-medium text-foreground">{t('full-access')}</p>
				<p className="mt-1 text-muted-foreground">
					{t('system-role-full-access-description')}
				</p>
			</div>
		);
	}

	if (assignedKeys.length === 0) {
		return (
			<div className="px-[18px] py-8 text-center text-[13px] text-muted-foreground">
				{t('no-permissions-assigned-to-role')}
			</div>
		);
	}

	return <PermissionMatrix assignedKeys={assignedKeys} catalog={catalog} />;
};
