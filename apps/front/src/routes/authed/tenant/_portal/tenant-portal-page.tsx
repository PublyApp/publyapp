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
	data: {
		redirectCode?: string | null;
		hasSuspendedTenants?: boolean | null;
	};
}) => {
	const navigate = useNavigate();
	const redirectCode = data.redirectCode;
	const hasSuspendedTenants = data.hasSuspendedTenants ?? false;

	// Handle tenant-picker case - render picker UI instead of redirecting
	const showTenantPicker = redirectCode === REDIRECT_CODE.TENANT_PICKER;

	useEffect(() => {
		// Don't redirect if showing tenant picker
		if (showTenantPicker) return;

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
	}, [redirectCode, navigate, showTenantPicker, hasSuspendedTenants]);

	if (showTenantPicker) {
		return <TenantPickerView />;
	}

	return <SplashScreen />;
};

const TenantPortalPage = () => {
	// Get current user ID for identity-scoped cookie lookup
	const { data: userAuthData } = useGetUserAuthData();
	const userId = userAuthData?.id;

	// Check for last used tenant from identity-scoped cookie (with legacy fallback)
	const tenantHint = useMemo(() => {
		if (!userId) return undefined;

		// Try new identity-scoped mapping first
		const hintsMap = readTenantHintsFromBrowser();
		const hint = getTenantHintForUser(hintsMap, userId);
		if (hint) return hint;

		// Fall back to legacy cookie for migration period
		return readLegacyTenantFromBrowser();
	}, [userId]);

	// Pass hint to API - it will validate access and return it if valid,
	// or fallback to another tenant if the user no longer has access
	const query = useGetRedirectCode({
		variables: { tenantId: tenantHint },
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
