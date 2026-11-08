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

const FALLBACK_STATUS_MESSAGE = 'Erreur serveur';

export class ApiError extends Error {
	readonly status: number;
	readonly detail: string;

	constructor(status: number, detail: string) {
		super(detail);
		this.name = 'ApiError';
		this.status = status;
		this.detail = detail;
	}
}

export type ApiRequestOptions = {
	method?: 'GET' | 'POST';
	body?: unknown;
	sessionToken?: string | null;
	tenantId?: string | null;
};

/** RFC 7807 problem body — the only fields this app reads. */
type ProblemBody = {
	detail?: unknown;
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

const readProblemDetail = (body: ProblemBody | null): string | null => {
	if (body === null) {
		return null;
	}
	const detail = body.detail;
	return typeof detail === 'string' && detail.length > 0 ? detail : null;
};

const getApiBaseUrl = (): string => {
	const baseUrl = process.env.EXPO_PUBLIC_API_URL;
	if (!baseUrl) {
		throw new ApiError(
			0,
			'EXPO_PUBLIC_API_URL est absent. Voir apps/mobile/README.md.',
		);
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

	const deadline = AbortSignal.timeout(15_000);
	let response: Response;
	try {
		response = await fetch(`${getApiBaseUrl()}${path}`, {
			method: options.method ?? 'GET',
			headers,
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
			signal: deadline,
		});
	} catch (error) {
		// React Native's fetch rejects with a plain AbortError, so ask the signal.
		if (deadline.aborted) {
			throw new ApiError(0, 'Le serveur ne répond pas. Réessayez.');
		}
		throw new ApiError(
			0,
			'Serveur injoignable. Vérifiez EXPO_PUBLIC_API_URL et le réseau.',
		);
	}

	const text = await response.text();
	const problem = parseProblemBody(text);
	if (!response.ok) {
		throw new ApiError(
			response.status,
			readProblemDetail(problem) ??
				`${FALLBACK_STATUS_MESSAGE} (${response.status})`,
		);
	}

	// The API contract is the source of truth for T; this wrapper only guards
	// transport and problem responses. Validation beyond that is out of v0 scope.
	return problem as T;
};
