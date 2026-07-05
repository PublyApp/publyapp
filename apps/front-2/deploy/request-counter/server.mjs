import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getControlResponse, writeControlResponse } from './control-routes.mjs';

const parseUpstream = () => {
	if (!process.env.API_UPSTREAM) {
		throw new Error('API_UPSTREAM is required');
	}

	let upstream;

	try {
		upstream = new URL(process.env.API_UPSTREAM);
	} catch (error) {
		throw new Error(`API_UPSTREAM must be a valid URL: ${error.message}`);
	}

	if (upstream.username !== '' || upstream.password !== '') {
		throw new Error(
			'API_UPSTREAM must not include credentials (username/password).',
		);
	}

	if (upstream.search !== '') {
		throw new Error('API_UPSTREAM must not include a query string.');
	}

	if (upstream.protocol !== 'http:') {
		throw new Error(
			`API_UPSTREAM must use http:, received ${upstream.protocol}`,
		);
	}

	return upstream;
};

const UPSTREAM = parseUpstream();
const counts = new Map();

const getCountKey = (method, path) => `${method} ${path}`;

const createTlsOptions = () => {
	const dir = mkdtempSync(join(tmpdir(), 'request-counter-tls-'));
	const keyPath = join(dir, 'key.pem');
	const certPath = join(dir, 'cert.pem');

	execFileSync(
		'openssl',
		[
			'req',
			'-x509',
			'-newkey',
			'rsa:2048',
			'-nodes',
			'-keyout',
			keyPath,
			'-out',
			certPath,
			'-days',
			'7',
			'-subj',
			'/CN=api.front-2.localhost',
			'-addext',
			'subjectAltName=DNS:api.front-2.localhost',
		],
		{ stdio: 'ignore' },
	);

	return {
		key: readFileSync(keyPath),
		cert: readFileSync(certPath),
	};
};

const handleRequest = (req, res) => {
	const controlResponse = getControlResponse(req, counts);
	if (controlResponse) {
		writeControlResponse(res, controlResponse);
		return;
	}

	// Countering strips query strings so counts are path-based.
	// Assertions for q/size/sort_id/sort_order/cursor changes should use Playwright
	// network events, not this counter.
	const path = req.url?.split('?')[0] ?? '';
	const countKey = getCountKey(req.method, path);
	counts.set(countKey, (counts.get(countKey) ?? 0) + 1);

	const basePath = UPSTREAM.pathname.replace(/\/$/, '');
	const upstreamPath = `${basePath}${req.url}`;

	const up = httpRequest(
		{
			hostname: UPSTREAM.hostname,
			port: UPSTREAM.port,
			path: upstreamPath,
			method: req.method,
			headers: { ...req.headers, host: UPSTREAM.host },
		},
		(u) => {
			res.writeHead(u.statusCode ?? 502, u.headers);
			u.pipe(res);
		},
	);

	up.on('error', () => {
		req.destroy();
		res.destroy();
	});

	req.pipe(up);
};

createServer(handleRequest).listen(8800, '0.0.0.0', () => {
	console.log(
		'request-counter on :8800 -> ' + UPSTREAM.origin + UPSTREAM.pathname,
	);
});

createHttpsServer(createTlsOptions(), handleRequest).listen(
	9443,
	'0.0.0.0',
	() => {
		console.log(
			'request-counter TLS on :9443 -> ' + UPSTREAM.origin + UPSTREAM.pathname,
		);
	},
);
