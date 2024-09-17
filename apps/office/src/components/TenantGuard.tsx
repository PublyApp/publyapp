import type { ReactNode } from 'react';

import { Outlet, useParams } from 'react-router-dom';

import { useGetClientAuthSuspenseQuery } from '@/ui-react/lib/react-query/features/auth/auth.hooks';

type Props = { children?: ReactNode };

const TenantGuard = ({ children }: Props) => {
	const params = useParams();

	const {
		result: { data: authData, error },
	} = useGetClientAuthSuspenseQuery();

	if (error) {
		// return null;
		throw error;
	}

	const isMemberOfTenant = params.tenantId === authData.tenant?.objectId;

	if (!isMemberOfTenant) {
		return <h1>Forbidden tenant</h1>;
	}

	return children ?? <Outlet />;
};

export default TenantGuard;
