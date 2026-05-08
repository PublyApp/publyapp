import { useOutletContext } from 'react-router';

import type { TenantUserDetailsOutletContext } from '../_layout/tenant-user-details-layout';
import { TenantUserDetailsBreadcrumbs } from '../_parts/tenant-user-details-breadcrumbs';
import TenantUserUpdateForm, {
	type TenantUserUpdateData,
} from '../_parts/tenant-user-update-form';

const TenantUserDetailsGeneralPage = () => {
	const { tenantUser, title } =
		useOutletContext<TenantUserDetailsOutletContext>();

	const currentUser: TenantUserUpdateData = {
		firstName: tenantUser.firstName ?? undefined,
		lastName: tenantUser.lastName ?? undefined,
		email: tenantUser.email ?? undefined,
		avatar: tenantUser.avatarUrl ?? undefined,
		status: tenantUser.status ?? undefined,
		companyCount: tenantUser.companyCount ?? 0,
		createdAt: tenantUser.createdAt ?? undefined,
		updatedAt: tenantUser.updatedAt ?? undefined,
	};

	return (
		<>
			<TenantUserDetailsBreadcrumbs title={title} />
			<TenantUserUpdateForm currentUser={currentUser} />
		</>
	);
};

export default TenantUserDetailsGeneralPage;
