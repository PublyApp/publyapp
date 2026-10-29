const CONTROL_INDEX_PATH = '/__counter';
const CONTROL_RESET_PATH = '/__counter/reset';
/**
 * Per-client attribution key (#2260). The sidecar counts traffic from every
 * worker and browser on the stack globally, so a spec that asserts an exact
 * request count can only be hermetic if nothing else hits the same path
 * concurrently — which used to be guaranteed by Playwright project ordering
 * (`chromium-hermetic-counter` depended on `chromium`/`chromium-faults`
 * completing first), at the cost of the guard disappearing entirely whenever a
 * sibling project failed.
 *
 * A request may carry this query parameter; its count is then also kept under
 * a marker-scoped bucket. A marker-scoped read returns only that client's
 * traffic, so the spec no longer depends on being the only client on the
 * stack. Unmarked traffic is counted exactly as before, so the healthcheck and
 * ad hoc probes keep working.
 */
export const COUNTER_MARKER_QUERY_KEY = '__e2e_counter';

/**
 * @typedef {object} ControlRequest
 * @property {string} [method]
 * @property {string} [url]
 */

/**
 * @typedef {{ statusCode: number, headers: Record<string, string>, body: string }} ControlResponse
 */

/** @param {string} method @param {string} path @param {string | null} [marker] @returns {string} */
export const getCountKey = (method, path, marker) =>
	marker === null || marker === undefined || marker === ''
		? `${method} ${path}`
		: `${method} ${path}?${COUNTER_MARKER_QUERY_KEY}=${marker}`;
/** @param {string | undefined} requestUrl @returns {string} */
const getRawPath = (requestUrl) => (requestUrl ?? '/').split('?')[0] ?? '/';

/**
 * Splits a count key into its method, path and marker bucket (`null` for
 * unmarked traffic). Keys are `"<METHOD> <path>"` or
 * `"<METHOD> <path>?<markerKey>=<marker>"`.
 * @param {string} key
 * @returns {{ method: string, path: string, marker: string | null }}
 */
const parseCountKey = (key) => {
	const separator = key.indexOf(' ');
	const method = key.slice(0, separator);
	const withoutMethod = key.slice(separator + 1);
	const queryStart = withoutMethod.indexOf('?');
	if (queryStart === -1) {
		return { method, path: withoutMethod, marker: null };
	}

	const marker = new URLSearchParams(withoutMethod.slice(queryStart + 1)).get(
		COUNTER_MARKER_QUERY_KEY,
	);

	return { method, path: withoutMethod.slice(0, queryStart), marker };
};

/**
 * Totals the path, optionally restricted to one marker bucket and/or one
 * method. With no marker it sums every bucket, which is the pre-#2260 global
 * behaviour the healthcheck and ad hoc probes rely on.
 * @param {Map<string, number>} counts
 * @param {string} path
 * @param {string | null} marker
 * @param {string | null} method
 * @returns {number}
 */
const getPathTotal = (counts, path, marker = null, method = null) => {
	let total = 0;

	for (const [key, count] of counts) {
		const parsed = parseCountKey(key);
		if (parsed.path !== path) {
			continue;
		}
		if (marker !== null && parsed.marker !== marker) {
			continue;
		}
		if (method !== null && parsed.method !== method) {
			continue;
		}
		total += count;
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
		const countedMethod = url.searchParams.get('method')?.toUpperCase() ?? null;
		const marker = url.searchParams.get(COUNTER_MARKER_QUERY_KEY);
		const count = getPathTotal(counts, path, marker, countedMethod);

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
