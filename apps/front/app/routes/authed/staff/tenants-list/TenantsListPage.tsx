import DashboardContainer from '@/front/components/ui/layout/DashboardContainer';

import TenantsTable from './parts/TenantsTable';

const TenantsListPage = () => {
	return (
		<DashboardContainer>
			<h1>Admin: Tenants List Page</h1>
			<TenantsTable />
		</DashboardContainer>
	);
};

export default TenantsListPage;
