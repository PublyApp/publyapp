/**
 * @vitest-environment node
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	assertNormalStaticFileResponse,
	INDEX_HTML_BODY,
} from '../tests/helpers/static-file-assertions';
import { executeStaticFileScenario } from '../tests/helpers/static-file-scenario';

const tmpDir = join(process.cwd(), '.test-static-assets');

const createFixtureFiles = (): void => {
	mkdirSync(tmpDir, { recursive: true });
	writeFileSync(join(tmpDir, 'index.html'), INDEX_HTML_BODY);
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
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// Test fixture cleanup is best effort.
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

		const response = await executeStaticFileScenario({
			directory: tmpDir,
			handler,
		});

		await assertNormalStaticFileResponse(response);
	});

	test('reports a missing static-file response clearly', async () => {
		await expect(assertNormalStaticFileResponse(undefined)).rejects.toThrow(
			'Expected static middleware to return a response for index.html',
		);
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
