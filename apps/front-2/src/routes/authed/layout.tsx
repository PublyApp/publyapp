import { IconAlertCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
	redirect,
	createFileRoute,
	useLocation,
	Outlet,
	useNavigate,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import {
	createClient,
	getSessionTokensFromBrowser,
} from '~/lib/api-client/client-manager';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';
import {
	queryParamKey,
	queryParamValue,
	REDIRECT_CODE,
} from '@org/shared-ts/lib/constants';
import {
	selectToken,
	type ParsedSessionTokens,
} from '@org/shared-ts/lib/session/parse';

import { AuthedLayout } from '../../layouts/authed-layout';

const STAFF_PATH = '/staff';
const TENANT_PATH = '/tenant';

export const shouldLogoutForFailure = (error: unknown): boolean => {
	const failure = toApiFailure(error);
	return failure.kind === 'problem' && failure.status === 401;
};

const getFailureStatus = (error: unknown): number | undefined => {
	const status = getFailureStatusFromError(error);
	if (status !== undefined) {
		return status;
	}

	const failure = toApiFailure(error);
	return failure.kind === 'problem' ? failure.status : undefined;
};

const toStatus = (status: unknown): number | undefined => {
	if (typeof status !== 'number' || Number.isNaN(status)) {
		return undefined;
	}

	if (!Number.isInteger(status) || status < 100 || status > 599) {
		return undefined;
	}

	return status;
};

const getFailureStatusFromError = (error: unknown): number | undefined => {
	if (error instanceof Response) {
		return toStatus(error.status);
	}

	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	const record = error as Record<string, unknown>;
	return (
		toStatus(record.responseStatusCode) ??
		toStatus(record.status) ??
		toStatus((record.response as Record<string, unknown>)?.status) ??
		undefined
	);
};

const getProblemFromError = (
	error: unknown,
):
	| {
			status: number;
			translationKey?: string;
			detail?: string;
			title?: string;
	  }
	| undefined => {
	const failure = toApiFailure(error);
	if (failure.kind !== 'problem') {
		return undefined;
	}

	return {
		status: failure.status,
		translationKey: failure.translationKey,
		detail: failure.detail,
		title: failure.title,
	};
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

const parseRedirectCode = async (
	token: string,
): Promise<string | undefined> => {
	const client = createClient({ getSessionToken: () => token });
	try {
		const result = await client.auth.redirectCode.get();

		if (result?.redirectCode === REDIRECT_CODE.UNAUTHORIZED) {
			throw {
				status: 403,
				responseStatusCode: 403,
				title: 'Forbidden',
				detail: 'User has no accessible scope.',
			};
		}

		return result?.redirectCode ?? undefined;
	} catch (error: unknown) {
		const status = getFailureStatusFromError(error);
		const asFailure = getProblemFromError(error);
		if (status === undefined) {
			throw error;
		}

		throw {
			...asFailure,
			status,
			responseStatusCode: status,
		};
	}
};

export const Route = createFileRoute('/_authed-layout')({
	ssr: false,
	beforeLoad: async ({ location }) => {
		if (typeof document === 'undefined') {
			return;
		}

		const tokens = getSessionTokensFromBrowser();
		const pathname = location.pathname ?? '';
		const { redirectPath, token } = determineSessionToken(tokens, pathname);

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
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
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
	const pathname = location.pathname ?? '';
	const search = location.search as Record<string, unknown>;
	const navigate = useNavigate();
	const isStaffSurface = pathname.startsWith(STAFF_PATH);
	const isTenantSurface = pathname.startsWith(TENANT_PATH);
	const surfaceScope = isStaffSurface
		? 'staff'
		: isTenantSurface
			? 'tenant'
			: 'other';
	const query = useQuery({
		queryKey: ['front-2', 'auth', 'surface-redirect-code', surfaceScope],
		queryFn: async () => {
			const tokens = getSessionTokensFromBrowser();
			const resolved = determineSessionToken(tokens, pathname);

			if (!resolved.token) {
				return undefined;
			}

			return parseRedirectCode(resolved.token);
		},
		enabled: surfaceScope !== 'other',
		retry: false,
	});
	const routeFailureStatus =
		query.isError && query.error ? getFailureStatus(query.error) : undefined;
	const hasQueryError = query.isError && Boolean(query.error);

	useEffect(() => {
		if (hasQueryError || query.data === undefined) {
			return;
		}

		if (isStaffSurface && query.data !== REDIRECT_CODE.STAFF) {
			void navigate({ to: TENANT_PATH, replace: true });
		} else if (isTenantSurface && query.data === REDIRECT_CODE.STAFF) {
			void navigate({ to: STAFF_PATH, replace: true });
		}
	}, [
		hasQueryError,
		isStaffSurface,
		isTenantSurface,
		pathname,
		navigate,
		query.data,
	]);

	const isSurfaceMismatch =
		!hasQueryError &&
		query.data !== undefined &&
		((isStaffSurface && query.data !== REDIRECT_CODE.STAFF) ||
			(isTenantSurface && query.data === REDIRECT_CODE.STAFF));

	if (hasQueryError) {
		if (query.error && shouldLogoutForFailure(query.error)) {
			return <LogoutRedirect />;
		}

		if (routeFailureStatus === 403) {
			return <View403 />;
		}

		if (routeFailureStatus === 404) {
			return <View404 />;
		}

		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="500 — Server Error"
				title="Something went wrong"
				description="There was a problem loading this page."
			/>
		);
	}

	if (query.isLoading || isSurfaceMismatch) {
		return (
			<AuthedLayout pathname={pathname} search={search}>
				Loading…
			</AuthedLayout>
		);
	}

	return (
		<AuthedLayout pathname={pathname} search={search}>
			<Outlet />
		</AuthedLayout>
	);
}
