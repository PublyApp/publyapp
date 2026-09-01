/**
 * @vitest-environment node
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from 'vitest';

// Each run gets its own disposable temp dir (mkdtemp, not a fixed name):
// concurrent executions across worktrees must not clobber each other's
// fixtures mid-test (round-4 review of #1941).
const tmpDir = mkdtempSync(join(tmpdir(), 'publyapp-test-static-assets-'));

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
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// best effort
	}
};

// Remove the per-run temp dir once the suite is done.
afterAll(cleanupFixtureFiles);

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

		// #1915: assert the EXACT body, not just ok — a 200 with an
		// arbitrary body would pass the weaker assertion. The served file
		// must contain the fixture content the test wrote.
		expect(response?.ok).toBe(true);
		expect(response).toBeDefined();
		const body = await response!.text();
		expect(body).toBe('<html><body>OK</body></html>');
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
		// #1915: assert exact refusal — ok must be false AND the body must
		// not contain the secret, covering both the fall-through (undefined)
		// and explicit 404 shapes.
		expect(response?.ok).toBe(false);
		if (response && response.ok) {
			const text = await response.text();
			expect(text).not.toContain('SECRET_KEY=abc123');
		}
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
		// #1915: assert exact refusal — ok must be false AND body must not
		// contain the git config content.
		expect(response?.ok).toBe(false);
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
		// #1915: assert the EXACT body, not just ok.
		expect(response?.ok).toBe(true);
		expect(response).toBeDefined();
		const body = await response!.text();
		expect(body).toBe('Contact: security@example.com');
	});
});
