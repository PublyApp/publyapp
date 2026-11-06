import type { ServerResponse } from 'node:http';

const CONTROL_INDEX_PATH = '/__counter';
const CONTROL_RESET_PATH = '/__counter/reset';

interface ControlRequest {
	method?: string;
	url?: string;
}

interface ControlResponse {
	statusCode: number;
	headers: Record<string, string>;
	body: string;
}

const getCountKey = (method: string, path: string): string =>
	`${method} ${path}`;
const getRawPath = (requestUrl: string | undefined): string =>
	(requestUrl ?? '/').split('?')[0] ?? '/';

const getPathTotal = (counts: Map<string, number>, path: string): number => {
	let total = 0;

	for (const [key, count] of counts) {
		const keyPath = key.slice(key.indexOf(' ') + 1);
		if (keyPath === path) {
			total += count;
		}
	}

	return total;
};

const methodNotAllowed = (allow: string): ControlResponse => ({
	statusCode: 405,
	headers: {
		allow,
		'content-type': 'text/plain; charset=utf-8',
	},
	body: 'Method Not Allowed',
});

const notFound = (): ControlResponse => ({
	statusCode: 404,
	headers: {
		'content-type': 'text/plain; charset=utf-8',
	},
	body: 'Not Found',
});

const json = (body: unknown): ControlResponse => ({
	statusCode: 200,
	headers: {
		'content-type': 'application/json',
	},
	body: JSON.stringify(body),
});

export const getControlResponse = (
	request: ControlRequest,
	counts: Map<string, number>,
): ControlResponse | null => {
	const method = request.method ?? 'GET';
	const rawPath = getRawPath(request.url);
	const url = new URL(request.url ?? '/', 'http://request-counter.local');

	if (rawPath === CONTROL_RESET_PATH) {
		if (method !== 'POST') {
			return methodNotAllowed('POST');
		}

		counts.clear();
		return {
			statusCode: 200,
			headers: {},
			body: 'ok',
		};
	}

	if (rawPath === CONTROL_INDEX_PATH) {
		if (method !== 'GET') {
			return methodNotAllowed('GET');
		}

		const path = url.searchParams.get('path') ?? '';
		const countedMethod = url.searchParams.get('method')?.toUpperCase();
		const count = countedMethod
			? (counts.get(getCountKey(countedMethod, path)) ?? 0)
			: getPathTotal(counts, path);

		return json({ count });
	}

	if (rawPath.startsWith(`${CONTROL_INDEX_PATH}/`)) {
		return notFound();
	}

	return null;
};

export const writeControlResponse = (
	res: ServerResponse,
	response: ControlResponse,
): void => {
	for (const [key, value] of Object.entries(response.headers)) {
		res.setHeader(key, value);
	}

	res.statusCode = response.statusCode;
	res.end(response.body);
};
