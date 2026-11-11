import { i18n } from '@/lib/i18n';
import type { MessageSpec } from '@/lib/i18n';

/**
 * The two headers PublyApp's API authenticates on. Defaults match the
 * deployment values documented in docs/deployment/first-deploy-runbook.md
 * (SESSION_TOKEN_HEADER_KEY / TENANT_ID_HEADER_KEY). A deployment that renames
 * them needs the EXPO_PUBLIC_* variables below.
 */
const SESSION_TOKEN_HEADER =
	process.env.EXPO_PUBLIC_SESSION_HEADER ?? 'X-Session-Token';

const TENANT_ID_HEADER =
	process.env.EXPO_PUBLIC_TENANT_HEADER ?? 'X-PublyApp-TenantId';

/** A 5xx is the server's fault; a 4xx is a refused request, not a server error. */
const fallbackStatusMessage = (status: number): MessageSpec => ({
	key: status >= 500 ? 'mobile-server-error' : 'mobile-request-refused',
	values: { status },
});

/**
 * The shared response-message wording for these is developer-facing
 * ("Request body validation failed"), so the app shows its own sentence.
 */
const MOBILE_ERROR_KEYS = new Map([
	['forbidden', 'mobile-error-forbidden'],
	['user-does-not-have-the-necessary-permissions', 'mobile-error-forbidden'],
	['bad-request', 'mobile-error-invalid-input'],
	['unprocessable-entity', 'mobile-error-invalid-input'],
	['request-body-missing', 'mobile-error-invalid-input'],
	['query-parameters-missing', 'mobile-error-invalid-input'],
	['request-body-validation-failed', 'mobile-error-invalid-input'],
	['query-parameters-validation-failed', 'mobile-error-invalid-input'],
	['too-many-requests', 'mobile-error-too-many-requests'],
	['internal-server-error', 'mobile-error-unavailable'],
	['service-unavailable', 'mobile-error-unavailable'],
	['gateway-timeout', 'mobile-error-unavailable'],
	['not-found', 'mobile-error-not-found'],
]);

/**
 * The API's `detail` is English; the web app translates `translationKey`
 * with the response-message namespace, and so does this app. An unknown key
 * falls back to a translated status message, never the English text.
 */
const responseMessageSpec = (body: ProblemBody | null): MessageSpec | null => {
	const key = body?.translationKey;
	if (typeof key !== 'string') {
		return null;
	}
	const mobileKey = MOBILE_ERROR_KEYS.get(key);
	if (mobileKey !== undefined) {
		return { key: mobileKey };
	}
	const namespaced = `response-message:${key}`;
	return i18n.exists(namespaced) ? { key: namespaced } : null;
};

export class ApiError extends Error {
	readonly status: number;
	readonly spec: MessageSpec;

	constructor(status: number, spec: MessageSpec) {
		super(spec.key);
		this.name = 'ApiError';
		this.status = status;
		this.spec = spec;
	}
}

/** The message to show for any thrown value, as a translatable spec. */
export const toMessageSpec = (
	error: unknown,
	fallbackKey: string,
): MessageSpec =>
	error instanceof ApiError ? error.spec : { key: fallbackKey };

export type ApiRequestOptions = {
	method?: 'GET' | 'POST';
	body?: unknown;
	sessionToken?: string | null;
	tenantId?: string | null;
};

/** RFC 7807 problem body — the only fields this app reads. */
type ProblemBody = {
	translationKey?: unknown;
};

const parseProblemBody = (text: string): ProblemBody | null => {
	if (text.length === 0) {
		return null;
	}
	try {
		const parsed: ProblemBody = JSON.parse(text);
		return parsed;
	} catch {
		return null;
	}
};

const getApiBaseUrl = (): string => {
	const baseUrl = process.env.EXPO_PUBLIC_API_URL;
	if (!baseUrl) {
		throw new ApiError(0, { key: 'mobile-api-url-missing' });
	}
	return baseUrl.replace(/\/+$/, '');
};

export const apiRequest = async <T>(
	path: string,
	options: ApiRequestOptions = {},
): Promise<T> => {
	const headers = new Headers();
	headers.set('Accept', 'application/json');
	if (options.body !== undefined) {
		headers.set('Content-Type', 'application/json');
	}
	if (options.sessionToken) {
		headers.set(SESSION_TOKEN_HEADER, options.sessionToken);
	}
	if (options.tenantId) {
		headers.set(TENANT_ID_HEADER, options.tenantId);
	}

	const baseUrl = getApiBaseUrl();
	const deadline = AbortSignal.timeout(15_000);
	let response: Response;
	try {
		response = await fetch(`${baseUrl}${path}`, {
			method: options.method ?? 'GET',
			headers,
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
			signal: deadline,
		});
	} catch {
		// React Native's fetch rejects with a plain AbortError, so ask the signal.
		if (deadline.aborted) {
			throw new ApiError(0, { key: 'mobile-server-timeout' });
		}
		throw new ApiError(0, { key: 'mobile-server-unreachable' });
	}

	const text = await response.text();
	const problem = parseProblemBody(text);
	if (!response.ok) {
		throw new ApiError(
			response.status,
			responseMessageSpec(problem) ?? fallbackStatusMessage(response.status),
		);
	}

	// The API contract is the source of truth for T; this wrapper only guards
	// transport and problem responses. Validation beyond that is out of v0 scope.
	return problem as T;
};
