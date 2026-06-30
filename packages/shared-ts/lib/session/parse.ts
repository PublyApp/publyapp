export type ParsedSessionTokens = {
	staffToken?: string;
	tenantToken?: string;
};

export type SessionScope = 'tenant' | 'staff';

const decodeToken = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const encodeToken = (value: string): string => {
	return encodeURIComponent(value);
};

export const parseSessionCookie = (cookieValue: string): ParsedSessionTokens => {
	const result: ParsedSessionTokens = {};

	const value = cookieValue.trim();
	if (!value) {
		return result;
	}

	const isScopedCookie = /^(?:s|t):/.test(value);
	const isScopedPairFormat =
		/^(?:s:[^+]+|t:[^+]+)\+(?:s:[^+]+|t:[^+]+)(?:\+(?:s:[^+]+|t:[^+]+))*$/.test(
			value,
		);

	if (!isScopedCookie) {
		return { tenantToken: value || undefined };
	}

	if (!isScopedPairFormat) {
		return result;
	}

	for (const part of value.split('+')) {
		if (part.startsWith('s:')) {
			result.staffToken = decodeToken(part.slice(2)) || undefined;
		}
		if (part.startsWith('t:')) {
			result.tenantToken = decodeToken(part.slice(2)) || undefined;
		}
	}

	return result;
};

export const formatSessionCookie = (tokens: ParsedSessionTokens): string => {
	const parts: string[] = [];

	if (tokens.staffToken) {
		parts.push(`s:${encodeToken(tokens.staffToken)}`);
	}
	if (tokens.tenantToken) {
		parts.push(`t:${encodeToken(tokens.tenantToken)}`);
	}

	return parts.join('+');
};

export const selectToken = (
	tokens: ParsedSessionTokens,
	scope: SessionScope = 'tenant',
): string | undefined => {
	if (scope === 'staff') {
		return tokens.staffToken;
	}

	return tokens.tenantToken;
};
