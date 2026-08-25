import {
	selectToken,
	type ParsedSessionTokens,
} from '@org/shared-ts/lib/session/parse';

export type SessionScopeAvailability = {
	staff: boolean;
	tenant: boolean;
};

export type SessionScopeDecision = {
	scope?: 'staff' | 'tenant';
	redirectPath?: string;
};

export type ServerSessionAction = 'neutral' | 'redirect-login';
export type SessionSurface = 'staff' | 'tenant' | 'other';

export type AuthenticatedChromeGate = {
	failureStatus?: number;
	isHydrated: boolean;
	queryData?: string | null;
	queryStatus?: 'error' | 'pending' | 'success';
};

const STAFF_PATH = '/staff';
const TENANT_PATH = '/tenant';

export const getSessionSurface = (pathname: string): SessionSurface => {
	if (pathname.startsWith(STAFF_PATH)) {
		return 'staff';
	}

	if (pathname.startsWith(TENANT_PATH)) {
		return 'tenant';
	}

	return 'other';
};

export const getSurfaceRedirectCodeQueryKey = (surface: SessionSurface) =>
	['front', 'auth', 'surface-redirect-code', surface] as const;

export const shouldRenderAuthenticatedChrome = ({
	failureStatus,
	isHydrated,
	queryData,
	queryStatus,
}: AuthenticatedChromeGate): boolean => {
	if (!isHydrated) {
		return false;
	}

	if (queryStatus === 'success') {
		return queryData != null;
	}

	return queryStatus === 'error' && failureStatus === 403;
};

export const determineServerSessionAction = (
	sessionCookieValue: string | undefined,
): ServerSessionAction =>
	sessionCookieValue === undefined ? 'redirect-login' : 'neutral';

export const determineSessionScope = (
	availability: SessionScopeAvailability,
	pathname: string,
): SessionScopeDecision => {
	const isStaffPath = pathname.startsWith(STAFF_PATH);
	const isTenantPath = pathname.startsWith(TENANT_PATH);

	if (!availability.staff && !availability.tenant) {
		return {};
	}

	if (isStaffPath) {
		return availability.staff
			? { scope: 'staff' }
			: { redirectPath: TENANT_PATH };
	}

	if (isTenantPath) {
		return availability.tenant
			? { scope: 'tenant' }
			: { redirectPath: STAFF_PATH };
	}

	return { scope: availability.staff ? 'staff' : 'tenant' };
};

type SessionTokenDecision = {
	token: string | undefined;
	redirectPath?: string;
};

export const determineSessionToken = (
	tokens: ParsedSessionTokens,
	pathname: string,
): SessionTokenDecision => {
	const staffToken = tokens.staffToken;
	const tenantToken = selectToken(tokens, 'tenant');
	const decision = determineSessionScope(
		{
			staff: Boolean(staffToken),
			tenant: Boolean(tenantToken),
		},
		pathname,
	);
	let token: string | undefined;
	if (decision.scope === 'staff') {
		token = staffToken;
	} else if (decision.scope === 'tenant') {
		token = tenantToken;
	}

	if (decision.redirectPath) {
		return { token, redirectPath: decision.redirectPath };
	}

	return { token };
};
