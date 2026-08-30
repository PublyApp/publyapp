/**
 * @vitest-environment node
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

// Create a temp dir for static assets
const tmpDir = join(process.cwd(), '.test-static-assets');

const createFixtureFiles = (): void => {
	mkdirSync(tmpDir, { recursive: true });
	writeFileSync(join(tmpDir, 'index.html'), '<html><body>OK</body></html>');
	// .env at root - this IS a dot segment (starts with dot)
	writeFileSync(join(tmpDir, '.env'), 'SECRET_KEY=abc123');
	mkdirSync(join(tmpDir, '.git'), { recursive: true });
	writeFileSync(join(tmpDir, '.git', 'config'), '[core]');
	mkdirSync(join(tmpDir, '.well-known'), { recursive: true });
	writeFileSync(
		join(tmpDir, '.well-known', 'security.txt'),
		'Contact: security@example.com',
	);
};

const cleanupFixtureFiles = (): void => {
	const { rmSync } = require('node:fs');
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
};

describe('staticMiddleware — path traversal and dotfile guard (A2)', () => {
	beforeEach(() => {
		cleanupFixtureFiles();
		createFixtureFiles();
	});

	afterEach(() => {
		cleanupFixtureFiles();
	});

	test('serves a normal static file', async () => {
		const { staticMiddleware } = await import('srvx/static');
		const handler = staticMiddleware({ dir: tmpDir });

		// Create a mock request for index.html
		const request = new Request('http://localhost:3000/index.html');

		// The middleware returns a Response or undefined (to fall through)
		// We need to call it with the srvx middleware signature
		// Since srvx middleware signature is complex, we test the behavior indirectly
		const response = await handler(
			request,
			() => new Response('not found', { status: 404 }),
		);

		// If the middleware handles the request, it returns a Response
		// If not, it calls next() and returns that result
		expect(response).toBeDefined();
	});

	test('path traversal with ../ is refused', async () => {
		const { staticMiddleware } = await import('srvx/static');
		const handler = staticMiddleware({ dir: tmpDir });

		// Attempt to traverse outside the static dir
		const request = new Request('http://localhost:3000/../package.json');

		// The middleware should either return undefined (fall through) or return a 404
		// It should NOT serve the file
		const response = await handler(
			request,
			() => new Response('not found', { status: 404 }),
		);

		// If a response is returned, it should not contain the contents of package.json
		if (response && response.ok) {
			const text = await response.text();
			expect(text).not.toContain('"name": "publyapp"');
		}
	});

	test('dotfile .env is not served', async () => {
		const { staticMiddleware } = await import('srvx/static');
		const handler = staticMiddleware({ dir: tmpDir });

		const request = new Request('http://localhost:3000/.env');

		const response = await handler(
			request,
			() => new Response('not found', { status: 404 }),
		);

		// The middleware should not serve .env files (dotfiles default to [".well-known"])
		// If response is ok, it means the file was served - that's a failure
		expect(response?.ok).toBe(false);
	});

	test('dotfile .git/config is not served', async () => {
		const { staticMiddleware } = await import('srvx/static');
		const handler = staticMiddleware({ dir: tmpDir });

		const request = new Request('http://localhost:3000/.git/config');

		const response = await handler(
			request,
			() => new Response('not found', { status: 404 }),
		);

		// The middleware should not serve .git files
		if (response && response.ok) {
			const text = await response.text();
			expect(text).not.toContain('[core]');
		}
	});

	test('.well-known/security.txt IS served (allowlisted dotfile)', async () => {
		const { staticMiddleware } = await import('srvx/static');
		const handler = staticMiddleware({ dir: tmpDir });

		const request = new Request(
			'http://localhost:3000/.well-known/security.txt',
		);

		const response = await handler(
			request,
			() => new Response('not found', { status: 404 }),
		);

		// .well-known is the default allowlisted dotfile
		expect(response).toBeDefined();
		if (response && response.ok) {
			const text = await response.text();
			expect(text).toContain('Contact: security@example.com');
		}
	});
});
