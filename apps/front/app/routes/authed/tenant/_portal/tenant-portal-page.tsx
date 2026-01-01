import * as cookie from 'cookie';
import _ from 'lodash';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { SplashScreen } from '@/front/components/loading-screen/splash-screen';
import QueryDisplay from '@/front/components/query-display';
import { useGetRedirectCode } from '@/front/lib/react-query/features/common/auth.hooks';
import {
	FRONT_PATH_NAMES,
	LAST_USED_TENANT_ID_COOKIE_KEY,
} from '@/shared/lib/constants';

const RedirectToUnauthorized = () => {
	const navigate = useNavigate();

	useEffect(() => {
		navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
	}, [navigate]);

	return <SplashScreen />;
};

const RedirectHandler = ({
	data,
}: {
	data: { redirectCode?: string | null };
}) => {
	const navigate = useNavigate();

	useEffect(() => {
		const redirectCode = data.redirectCode;

		if (!redirectCode || redirectCode === 'unauthorized') {
			navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
		} else if (redirectCode === 'staff') {
			navigate(FRONT_PATH_NAMES.staff.root, { replace: true });
		} else {
			// redirectCode is a tenant ID
			navigate(FRONT_PATH_NAMES.tenant(redirectCode).root, { replace: true });
		}
	}, [data, navigate]);

	return <SplashScreen />;
};

const TenantPortalPage = () => {
	// Check for last used tenant cookie
	const lastUsedTenantId = useMemo(() => {
		const browserCookies = cookie.parse(document.cookie);
		return _.get(browserCookies, LAST_USED_TENANT_ID_COOKIE_KEY) as
			| string
			| undefined;
	}, []);

	// Pass last used tenant to API - it will validate access and return it if valid,
	// or fallback to another tenant if the user no longer has access
	const query = useGetRedirectCode({
		variables: { tenantId: lastUsedTenantId },
	});

	return (
		<QueryDisplay
			query={query}
			LoadingSlot={SplashScreen}
			ErrorSlot={RedirectToUnauthorized}
		>
			{({ data }) => <RedirectHandler data={data} />}
		</QueryDisplay>
	);
};

export default TenantPortalPage;
