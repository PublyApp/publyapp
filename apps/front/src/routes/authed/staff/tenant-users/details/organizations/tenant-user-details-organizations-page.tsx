import { useOutletContext } from 'react-router';

import type { TenantUserDetailsOutletContext } from '../_layout/tenant-user-details-layout';
import TenantUserCompaniesTable from '../_parts/tenant-user-companies-table';
import { TenantUserDetailsBreadcrumbs } from '../_parts/tenant-user-details-breadcrumbs';

const TenantUserDetailsOrganizationsPage = () => {
	const { title } = useOutletContext<TenantUserDetailsOutletContext>();

	return (
		<>
			<TenantUserDetailsBreadcrumbs title={title} />
			<TenantUserCompaniesTable />
		</>
	);
};

export default TenantUserDetailsOrganizationsPage;
