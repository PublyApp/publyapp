import { createFileRoute } from '@tanstack/react-router';

import { TenantCreateForm } from './_tenants-new-form';

const StaffTenantCreateRoute = () => {
	const navigate = Route.useNavigate();
	return <TenantCreateForm navigate={navigate} />;
};

export const Route = createFileRoute('/_authed-layout/staff/tenants/new')({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{ kind: 'label', labelKey: 'common:create-tenant' },
		],
	},
	component: StaffTenantCreateRoute,
});
