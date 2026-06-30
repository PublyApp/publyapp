import {
	isRouteErrorResponse,
	redirect,
	createFileRoute,
	useLocation,
	Outlet,
} from '@tanstack/react-router';
import { createClient, getSessionTokensFromBrowser } from '~/lib/api-client/client-manager';

import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { selectToken } from '@org/shared-ts/lib/session/parse';
import {
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
} from '@org/shared-ts/lib/constants';
import { toApiFailure } from '~/lib/api-failure';
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

const determineSessionToken = (
	tokens: ReturnType<typeof getSessionTokensFromBrowser>,
	pathname: string,
): string | undefined => {
	if (pathname.startsWith(STAFF_PATH)) {
		return tokens.staffToken ?? tokens.tenantToken;
	}

	if (pathname.startsWith(TENANT_PATH)) {
		return selectToken(tokens, 'tenant') ?? selectToken(tokens, 'staff');
	}

	return selectToken(tokens, 'tenant') ?? tokens.staffToken;
};

const parseRedirectCode = async (token: string): Promise<string | undefined> => {
	const client = createClient({ getSessionToken: () => token });
	const result = await client.auth.redirectCode.get();

	return result?.redirectCode;
};

export const Route = createFileRoute('/_authed-layout')({
	ssr: false,
	beforeLoad: async ({ location }) => {
		const tokens = getSessionTokensFromBrowser();
		const hasSessionToken = Boolean(
			selectToken(tokens, 'tenant') || selectToken(tokens, 'staff'),
		);

		if (!hasSessionToken) {
			throw redirect({
				to: '/login',
				search: {
					[queryParamKey.login_page.redirect_cause]:
						queryParamValue.login_page.redirect_cause.invalid_session,
				},
			});
		}

		const token = determineSessionToken(tokens, location.pathname);
		if (!token) {
			throw redirect({
				to: '/login',
				search: {
					[queryParamKey.login_page.redirect_cause]:
						queryParamValue.login_page.redirect_cause.invalid_session,
				},
			});
		}

		try {
			const redirectCode = await parseRedirectCode(token);

			const isStaffPath = location.pathname.startsWith(STAFF_PATH);
			const isTenantPath = location.pathname.startsWith(TENANT_PATH);

			if (isStaffPath) {
				if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
					throw new Response('user has no accessible surface', {
						status: 403,
					});
				}

				if (redirectCode !== REDIRECT_CODE.STAFF) {
					return redirect('/tenant');
				}
			}

			if (isTenantPath) {
				if (redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
					throw new Response('user has no accessible scope', { status: 403 });
				}

				if (redirectCode === REDIRECT_CODE.STAFF) {
					return redirect('/staff');
				}
			}

			return;
		} catch (error) {
			if (error instanceof Response) {
				throw error;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'problem' && failure.status) {
				throw new Response(failure.title ?? undefined, { status: failure.status });
			}

			throw new Response('auth check failed', { status: 500 });
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

	return (
		<AuthedLayout pathname={location.pathname}>
			<Outlet />
		</AuthedLayout>
	);
}
