import PageContainer from '@/office/components/PageContainer';

import TenantsListHeader from './parts/TenantsListHeader';
import TenantsTable from './parts/TenantsTable';

const TenantsList = () => {
	return (
		<PageContainer>
			<TenantsListHeader />
			<TenantsTable />
		</PageContainer>
	);
};

export default TenantsList;
