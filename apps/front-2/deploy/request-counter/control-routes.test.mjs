import assert from 'node:assert/strict';
import test from 'node:test';

import { getControlResponse } from './control-routes.mjs';

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
