export type ParsedSessionTokens = {
	staffToken?: string;
	tenantToken?: string;
};

export type SessionScope = 'tenant' | 'staff';

export const parseSessionCookie = (cookieValue: string): ParsedSessionTokens => {
	const result: ParsedSessionTokens = {};

	const value = cookieValue.trim();
	const isDualFormat =
		value.startsWith('s:') ||
		value.startsWith('t:');

	if (!isDualFormat) {
		return { tenantToken: value || undefined };
	}

	for (const part of value.split('+')) {
		if (part.startsWith('s:')) {
			result.staffToken = part.slice(2) || undefined;
		}
		if (part.startsWith('t:')) {
			result.tenantToken = part.slice(2) || undefined;
		}
	}

	return result;
};

export const formatSessionCookie = (tokens: ParsedSessionTokens): string => {
	const parts: string[] = [];

	if (tokens.staffToken) {
		parts.push(`s:${tokens.staffToken}`);
	}
	if (tokens.tenantToken) {
		parts.push(`t:${tokens.tenantToken}`);
	}

	return parts.join('+');
};

export const selectToken = (
	tokens: ParsedSessionTokens,
	scope: SessionScope = 'tenant',
): string | undefined => {
	if (scope === 'staff') {
		return tokens.staffToken ?? tokens.tenantToken;
	}

	return tokens.tenantToken ?? tokens.staffToken;
};
