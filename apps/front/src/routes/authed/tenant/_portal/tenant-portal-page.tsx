import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import {
	FRONT_PATH_NAMES,
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
} from '@org/shared-ts/lib/constants';

import { View403 } from '#app/components/error/403-view.tsx';
import { GenericErrorView } from '#app/components/error/generic-error-view.tsx';
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

	// Two render-in-place cases. Anything else triggers a navigation in the
	// useEffect below. We can't navigate during render, so the effect handles
	// the actual location change after first paint.
	const showTenantPicker = redirectCode === REDIRECT_CODE.TENANT_PICKER;
	// `!redirectCode` covers the "API returned data but no code" edge — same
	// outcome as explicit UNAUTHORIZED: the user is signed in but has no scope
	// they can access. View403 explains it; the previous behavior was to
	// navigate to /unauthorized which has been deleted in PR #398.
	const showNoAccess =
		!redirectCode || redirectCode === REDIRECT_CODE.UNAUTHORIZED;

	useEffect(() => {
		if (showTenantPicker || showNoAccess) return;

		if (redirectCode === REDIRECT_CODE.STAFF) {
			void navigate(FRONT_PATH_NAMES.staff.root, { replace: true });
		} else {
			// redirectCode is a tenant ID
			let path = FRONT_PATH_NAMES.tenant(redirectCode).root;
			if (hasSuspendedTenants) {
				path += `?${queryParamKey.notice}=${queryParamValue.notice.org_suspended}`;
			}
			void navigate(path, { replace: true });
		}
	}, [
		redirectCode,
		navigate,
		showTenantPicker,
		showNoAccess,
		hasSuspendedTenants,
	]);

	if (showTenantPicker) {
		return <TenantPickerView />;
	}

	if (showNoAccess) {
		return <View403 withLayout={false} />;
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
			// ErrorSlot fires when the redirect-code query itself fails (network,
			// 5xx, parse error). That is a SYSTEM error, semantically distinct
			// from the no-scope case below — we use GenericErrorView (warning
			// tone, generic copy) here, NOT View403, which would imply "you tried
			// to access something forbidden" — the user hasn't tried anything yet.
			ErrorSlot={() => <GenericErrorView withLayout={false} />}
		>
			{({ data }) => <RedirectHandler data={data} />}
		</QueryDisplay>
	);
};

export default TenantPortalPage;
