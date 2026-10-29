import assert from 'node:assert/strict';
import test from 'node:test';

import {
	COUNTER_MARKER_QUERY_KEY,
	getControlResponse,
	getCountKey,
} from './control-routes.mjs';

const buildCounts = () =>
	new Map([
		['GET /staff/users', 2],
		['POST /staff/users', 1],
		['GET /__counterish', 4],
	]);

test('GET /__counter returns a method-specific count when method is provided', () => {
	const response = getControlResponse(
		{
			method: 'GET',
			url: '/__counter?path=%2Fstaff%2Fusers&method=get',
		},
		buildCounts(),
	);

	assert.deepEqual(response, {
		statusCode: 200,
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({ count: 2 }),
	});
});

test('GET /__counter without a method returns the path total for health checks and ad hoc probes', () => {
	const response = getControlResponse(
		{
			method: 'GET',
			url: '/__counter?path=%2Fstaff%2Fusers',
		},
		buildCounts(),
	);

	assert.equal(response?.statusCode, 200);
	assert.equal(response?.body, JSON.stringify({ count: 3 }));
});

test('POST /__counter/reset clears counts and returns ok', () => {
	const counts = buildCounts();

	const response = getControlResponse(
		{
			method: 'POST',
			url: '/__counter/reset',
		},
		counts,
	);

	assert.equal(response?.statusCode, 200);
	assert.equal(response?.body, 'ok');
	assert.equal(counts.size, 0);
});

test('a marker-scoped read returns only that client, while the unmarked read still totals every bucket', () => {
	const counts = new Map([
		[getCountKey('GET', '/staff/invitations', 'client-a'), 1],
		[getCountKey('GET', '/staff/invitations', 'client-b'), 2],
		['GET /staff/invitations', 4],
	]);

	/** @param {string} query @returns {string | undefined} */
	const read = (query) =>
		getControlResponse({ method: 'GET', url: `/__counter?${query}` }, counts)
			?.body;

	assert.equal(
		read(
			`path=%2Fstaff%2Finvitations&method=GET&${COUNTER_MARKER_QUERY_KEY}=client-a`,
		),
		JSON.stringify({ count: 1 }),
	);
	assert.equal(
		read(
			`path=%2Fstaff%2Finvitations&method=GET&${COUNTER_MARKER_QUERY_KEY}=client-b`,
		),
		JSON.stringify({ count: 2 }),
	);
	assert.equal(
		read(`path=%2Fstaff%2Finvitations&${COUNTER_MARKER_QUERY_KEY}=client-a`),
		JSON.stringify({ count: 1 }),
	);
	// No marker: the pre-#2260 global total, summed across every bucket.
	assert.equal(
		read('path=%2Fstaff%2Finvitations&method=GET'),
		JSON.stringify({ count: 7 }),
	);
	// An unknown marker reads zero rather than falling back to the total.
	assert.equal(
		read(
			`path=%2Fstaff%2Finvitations&method=GET&${COUNTER_MARKER_QUERY_KEY}=client-c`,
		),
		JSON.stringify({ count: 0 }),
	);
});

test('unknown /__counter methods return 405', () => {
	const response = getControlResponse(
		{
			method: 'DELETE',
			url: '/__counter',
		},
		buildCounts(),
	);

	assert.deepEqual(response, {
		statusCode: 405,
		headers: {
			allow: 'GET',
			'content-type': 'text/plain; charset=utf-8',
		},
		body: 'Method Not Allowed',
	});
});

test('known control subpaths reject unsupported methods with 405', () => {
	const response = getControlResponse(
		{
			method: 'GET',
			url: '/__counter/reset',
		},
		buildCounts(),
	);

	assert.deepEqual(response, {
		statusCode: 405,
		headers: {
			allow: 'POST',
			'content-type': 'text/plain; charset=utf-8',
		},
		body: 'Method Not Allowed',
	});
});

test('unknown /__counter/* paths return 404', () => {
	const response = getControlResponse(
		{
			method: 'GET',
			url: '/__counter/unknown',
		},
		buildCounts(),
	);

	assert.deepEqual(response, {
		statusCode: 404,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
		},
		body: 'Not Found',
	});
});

test('dot-segment escapes under /__counter/* still return 404', () => {
	const counts = buildCounts();

	for (const url of [
		'/__counter/../staff/users',
		'/__counter/%2e%2e/staff/users',
	]) {
		const response = getControlResponse(
			{
				method: 'GET',
				url,
			},
			counts,
		);

		assert.deepEqual(response, {
			statusCode: 404,
			headers: {
				'content-type': 'text/plain; charset=utf-8',
			},
			body: 'Not Found',
		});
	}
});

test('non-control app paths that only start with /__counter fall through', () => {
	const response = getControlResponse(
		{
			method: 'GET',
			url: '/__counterish?q=1',
		},
		buildCounts(),
	);

	assert.equal(response, null);
});
