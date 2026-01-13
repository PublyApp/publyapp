import * as cookie from 'cookie';
import _ from 'lodash';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import {
	FRONT_PATH_NAMES,
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
} from '@org/shared-ts/lib/constants';

import { SplashScreen } from '#app/components/loading-screen/splash-screen.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import {
	getTenantHintForUser,
	readLegacyTenantFromBrowser,
	readTenantHintsFromBrowser,
} from '#app/lib/cookies/tenant-hint-cookie.utils.ts';
import {
	useGetRedirectCode,
	useGetUserAuthData,
} from '#app/lib/react-query/features/common/auth.hooks.ts';

import { TenantPickerView } from '../_shared/tenant-picker-view';

const RedirectToUnauthorized = () => {
	const navigate = useNavigate();

	useEffect(() => {
		void navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
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

		if (!redirectCode || redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			void navigate(FRONT_PATH_NAMES.unauthorized, { replace: true });
		} else if (redirectCode === REDIRECT_CODE.STAFF) {
			void navigate(FRONT_PATH_NAMES.staff.root, { replace: true });
		} else {
			// redirectCode is a tenant ID
			let path = FRONT_PATH_NAMES.tenant(redirectCode).root;
			if (hasSuspendedTenants) {
				path += `?${queryParamKey.notice}=${queryParamValue.notice.org_suspended}`;
			}
			void navigate(path, { replace: true });
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
