import DashboardContainer from '@/front/components/ui/layout/DashboardContainer';
import PageTitle from '@/front/components/ui/layout/PageTitle';

import TenantsTable from './parts/TenantsTable';

const TenantsListPage = () => {
	return (
		<DashboardContainer>
			<PageTitle>Tenants</PageTitle>
			<TenantsTable />
		</DashboardContainer>
	);
};

export default TenantsListPage;
