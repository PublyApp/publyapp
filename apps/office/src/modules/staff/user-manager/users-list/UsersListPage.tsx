import PageContainer from '@/office/components/PageContainer';

import UsersListHeader from './parts/UsersListHeader';
import UsersTable from './parts/UsersTable';

const UsersListPage = () => {
	return (
		<PageContainer>
			<UsersListHeader />
			<UsersTable />
		</PageContainer>
	);
};

export default UsersListPage;
