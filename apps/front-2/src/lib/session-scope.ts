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

const STAFF_PATH = '/staff';
const TENANT_PATH = '/tenant';

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

export const determineSessionToken = (
	tokens: ParsedSessionTokens,
	pathname: string,
): { token: string | undefined; redirectPath?: string } => {
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
