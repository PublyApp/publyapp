const CONTROL_INDEX_PATH = '/__counter';
const CONTROL_RESET_PATH = '/__counter/reset';

/**
 * @typedef {object} ControlRequest
 * @property {string} [method]
 * @property {string} [url]
 */

/**
 * @typedef {{ statusCode: number, headers: Record<string, string>, body: string }} ControlResponse
 */

/** @param {string} method @param {string} path @returns {string} */
const getCountKey = (method, path) => `${method} ${path}`;
/** @param {string | undefined} requestUrl @returns {string} */
const getRawPath = (requestUrl) => (requestUrl ?? '/').split('?')[0] ?? '/';

/** @param {Map<string, number>} counts @param {string} path @returns {number} */
const getPathTotal = (counts, path) => {
	let total = 0;

	for (const [key, count] of counts) {
		const keyPath = key.slice(key.indexOf(' ') + 1);
		if (keyPath === path) {
			total += count;
		}
	}

	return total;
};

/** @param {string} allow @returns {ControlResponse} */
const methodNotAllowed = (allow) => ({
	statusCode: 405,
	headers: {
		allow,
		'content-type': 'text/plain; charset=utf-8',
	},
	body: 'Method Not Allowed',
});

const notFound = () => ({
	statusCode: 404,
	headers: {
		'content-type': 'text/plain; charset=utf-8',
	},
	body: 'Not Found',
});

/** @param {unknown} body @returns {ControlResponse} */
const json = (body) => ({
	statusCode: 200,
	headers: {
		'content-type': 'application/json',
	},
	body: JSON.stringify(body),
});

/**
 * @param {ControlRequest} request
 * @param {Map<string, number>} counts
 * @returns {ControlResponse | null}
 */
export const getControlResponse = (request, counts) => {
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

/**
 * @param {import('node:http').ServerResponse} res
 * @param {ControlResponse} response
 */
export const writeControlResponse = (res, response) => {
	for (const [key, value] of Object.entries(response.headers)) {
		res.setHeader(key, value);
	}

	res.statusCode = response.statusCode;
	res.end(response.body);
};
