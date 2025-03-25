import BasicTable from '@/front/components/BasicTable';
import DashboardContainer from '@/front/components/ui/layout/DashboardContainer';

const TenantsListPage = () => {
	return (
		<DashboardContainer>
			<h1>Admin: Tenants List Page</h1>
			<BasicTable />
		</DashboardContainer>
	);
};

export default TenantsListPage;
