import { useEffect } from 'react';

import {
	isRouteErrorResponse,
	redirect,
	createFileRoute,
	useLocation,
	Outlet,
	useNavigate,
} from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { createClient, getSessionTokensFromBrowser } from '~/lib/api-client/client-manager';
import { selectToken, type ParsedSessionTokens } from '@org/shared-ts/lib/session/parse';
import {
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
} from '@org/shared-ts/lib/constants';
import { toApiFailure } from '~/lib/api-failure';

import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { AuthedLayout } from '../../layouts/authed-layout';

const STAFF_PATH = '/staff';
const TENANT_PATH = '/tenant';

export const shouldLogoutForFailure = (error: unknown): boolean => {
	const failure = toApiFailure(error);
	if (failure.kind === 'problem' && failure.status === 401) {
		return true;
	}

	return (
		isRouteErrorResponse(error) &&
		error.status === 401
	);
};

const getFailureStatus = (error: unknown): number | undefined => {
	if (isRouteErrorResponse(error)) {
		return error.status;
	}

	const failure = toApiFailure(error);
	return failure.kind === 'problem' ? failure.status : undefined;
};

const getSessionExpiredSearch = () => ({
	[queryParamKey.login_page.redirect_cause]:
		queryParamValue.login_page.redirect_cause.invalid_session,
});

const determineSessionToken = (
	tokens: ParsedSessionTokens,
	pathname: string,
): { token: string | undefined; redirectPath?: string } => {
	const isStaffPath = pathname.startsWith(STAFF_PATH);
	const isTenantPath = pathname.startsWith(TENANT_PATH);
	const staffToken = tokens.staffToken;
	const tenantToken = selectToken(tokens, 'tenant');

	if (!staffToken && !tenantToken) {
		return { token: undefined };
	}

	if (isStaffPath) {
		if (!staffToken) {
			return tenantToken
				? { token: undefined, redirectPath: TENANT_PATH }
				: { token: undefined };
		}

		return { token: staffToken };
	}

	if (isTenantPath) {
		if (!tenantToken) {
			return staffToken
				? { token: undefined, redirectPath: STAFF_PATH }
				: { token: undefined };
		}

		return { token: tenantToken };
	}

	return staffToken ? { token: staffToken } : { token: tenantToken };
};

const parseRedirectCode = async (token: string): Promise<string | undefined> => {
	const client = createClient({ getSessionToken: () => token });
	const result = await client.auth.redirectCode.get();

	if (result?.redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
		throw new Response('user has no accessible scope', { status: 403 });
	}

	return result?.redirectCode;
};

export const Route = createFileRoute('/_authed-layout')({
	ssr: false,
	beforeLoad: async ({ location }) => {
		const tokens = getSessionTokensFromBrowser();
		const { redirectPath, token } = determineSessionToken(tokens, location.pathname);

		if (!token && redirectPath) {
			throw redirect({ to: redirectPath });
		}

		if (!token) {
			throw redirect({
				to: '/login',
				search: getSessionExpiredSearch(),
			});
		}
	},
	errorComponent: ({ error }: { error: unknown }) => {
		const routeStatus = getFailureStatus(error);
		if (routeStatus === 401) {
			return <LogoutRedirect />;
		}

		if (routeStatus === 403) {
			return <View403 />;
		}

		if (routeStatus === 404) {
			return <View404 />;
		}

		return (
			<AppErrorView
				icon="!"
				code="500 — Server Error"
				title="Something went wrong"
				description="There was a problem loading this page."
			/>
		);
	},
	notFoundComponent: () => <View404 />,
	component: AuthedRouteLayout,
});

function AuthedRouteLayout() {
	const location = useLocation();
	const navigate = useNavigate();
	const tokens = getSessionTokensFromBrowser();
	const resolved = determineSessionToken(tokens, location.pathname);
	const query = useQuery({
		queryKey: ['front-2', 'auth', 'redirect-code', resolved.token, location.pathname],
		queryFn: async () => {
			if (!resolved.token) {
				return undefined;
			}

			return parseRedirectCode(resolved.token);
		},
		enabled: Boolean(resolved.token),
		retry: false,
	});

	if (query.isError && query.error) {
		throw query.error;
	}

	useEffect(() => {
		if (query.data === undefined) {
			return;
		}

		if (location.pathname.startsWith(STAFF_PATH) && query.data !== REDIRECT_CODE.STAFF) {
			void navigate({ to: TENANT_PATH, replace: true });
			return;
		}

		if (location.pathname.startsWith(TENANT_PATH) && query.data === REDIRECT_CODE.STAFF) {
			void navigate({ to: STAFF_PATH, replace: true });
		}
	}, [location.pathname, navigate, query.data]);

	if (query.isLoading) {
		return <AuthedLayout pathname={location.pathname}>Loading…</AuthedLayout>;
	}

	return (
		<AuthedLayout pathname={location.pathname}>
			<Outlet />
		</AuthedLayout>
	);
}
