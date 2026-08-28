import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DEAD_ENV_VAR = 'VITE_POSTHOG_PROJECT_TOKEN';

type RuntimeWindow = {
	__ENV__?: {
		PUBLIC_API_BASE_URL?: string;
		PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
	};
};

const envKeys = [
	'NODE_ENV',
	'POSTHOG_PROJECT_TOKEN',
	'PUBLIC_API_BASE_URL',
	'PUBLIC_POSTHOG_PROJECT_TOKEN',
	'SERVER_API_BASE_URL',
] as const;

const originalEnv = new Map<string, string | undefined>(
	envKeys.map((key) => [key, process.env[key]]),
);

const clearRuntimeEnv = (): void => {
	for (const key of envKeys) {
		delete process.env[key];
	}
};

const restoreRuntimeEnv = (): void => {
	for (const key of envKeys) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
			continue;
		}

		process.env[key] = value;
	}
};

const importEnv = async () => {
	return import('./env');
};

beforeEach(() => {
	vi.resetModules();
	clearRuntimeEnv();
});

afterEach(() => {
	vi.unstubAllGlobals();
	restoreRuntimeEnv();
});

describe('front runtime env registry', () => {
	test('does not validate missing values while the module is imported', async () => {
		await expect(importEnv()).resolves.toBeDefined();
	});

	test('validates required public config only when the public scope is read', async () => {
		const { getPublicEnv } = await importEnv();

		expect(() => getPublicEnv()).toThrow(
			/failed to validate front public runtime env:.*PUBLIC_API_BASE_URL/,
		);
	});

	test('does not require server config when the public scope is read', async () => {
		process.env.PUBLIC_API_BASE_URL = ' https://public.example.test ';
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().apiBaseUrl).toBe('https://public.example.test');
	});

	test('retries a public parse after a missing required value is supplied', async () => {
		const { getPublicEnv } = await importEnv();

		expect(() => getPublicEnv()).toThrow(
			/failed to validate front public runtime env:.*PUBLIC_API_BASE_URL/,
		);

		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';

		expect(getPublicEnv().apiBaseUrl).toBe('https://public.example.test');
	});

	test('treats required public values as missing when empty', async () => {
		process.env.PUBLIC_API_BASE_URL = '';
		const { getPublicEnv } = await importEnv();

		expect(() => getPublicEnv()).toThrow(
			/failed to validate front public runtime env:.*PUBLIC_API_BASE_URL/,
		);
	});

	test('treats required public values as missing when whitespace-only', async () => {
		process.env.PUBLIC_API_BASE_URL = '   ';
		const { getPublicEnv } = await importEnv();

		expect(() => getPublicEnv()).toThrow(
			/failed to validate front public runtime env:.*PUBLIC_API_BASE_URL/,
		);
	});

	test('reads browser public values only from window.__ENV__', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://process.example.test';
		vi.stubGlobal('window', {
			__ENV__: {
				PUBLIC_API_BASE_URL: ' https://browser.example.test ',
			},
		} satisfies RuntimeWindow);
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().apiBaseUrl).toBe('https://browser.example.test');
	});

	test('treats blank browser public values as absent', async () => {
		vi.stubGlobal('window', {
			__ENV__: {
				PUBLIC_API_BASE_URL: '   ',
			},
		} satisfies RuntimeWindow);
		const { getPublicEnv } = await importEnv();

		expect(() => getPublicEnv()).toThrow(
			/failed to validate front public runtime env:.*PUBLIC_API_BASE_URL/,
		);
	});

	test('does not fall back to process.env when browser public config is missing', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://process.example.test';
		vi.stubGlobal('window', {} satisfies RuntimeWindow);
		const { getPublicEnv } = await importEnv();

		expect(() => getPublicEnv()).toThrow(
			/failed to validate front public runtime env:.*PUBLIC_API_BASE_URL/,
		);
	});

	test('reads server-realm public values from process.env', async () => {
		process.env.PUBLIC_API_BASE_URL = ' https://process.example.test ';
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().apiBaseUrl).toBe('https://process.example.test');
	});

	test('rejects server-scope access in the browser before consulting process.env', async () => {
		vi.stubGlobal('window', {} satisfies RuntimeWindow);
		const { getServerEnv } = await importEnv();
		vi.stubGlobal('process', {
			env: new Proxy(
				{},
				{
					get: () => {
						throw new Error('process.env was read');
					},
				},
			),
		});

		expect(() => getServerEnv()).toThrow(
			'getServerEnv() must not be called in the browser',
		);
	});

	test('memoizes and freezes successful public and server scope reads', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		process.env.SERVER_API_BASE_URL = 'http://api:5000';
		const { getPublicEnv, getServerEnv } = await importEnv();

		const publicEnv = getPublicEnv();
		const serverEnv = getServerEnv();

		expect(getPublicEnv()).toBe(publicEnv);
		expect(getServerEnv()).toBe(serverEnv);
		expect(Object.isFrozen(publicEnv)).toBe(true);
		expect(Object.isFrozen(serverEnv)).toBe(true);
	});

	test('reads the PostHog token from browser runtime env', async () => {
		vi.stubGlobal('window', {
			__ENV__: {
				PUBLIC_API_BASE_URL: 'https://public.example.test',
				PUBLIC_POSTHOG_PROJECT_TOKEN: ' browser-token ',
			},
		} satisfies RuntimeWindow);
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().posthogProjectToken).toBe('browser-token');
	});

	test('reads the canonical PostHog token from server process env', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = ' canonical-token ';
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().posthogProjectToken).toBe('canonical-token');
	});

	test('skips a blank canonical PostHog token and uses the alias', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = '';
		process.env.POSTHOG_PROJECT_TOKEN = 'phc_valid';
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().posthogProjectToken).toBe('phc_valid');
	});

	test('supports the temporary server-side PostHog token alias', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		process.env.POSTHOG_PROJECT_TOKEN = ' alias-token ';
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().posthogProjectToken).toBe('alias-token');
	});

	test('prefers the canonical PostHog token over its compatibility alias', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = 'canonical-token';
		process.env.POSTHOG_PROJECT_TOKEN = 'alias-token';
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().posthogProjectToken).toBe('canonical-token');
	});

	test('returns undefined when the optional PostHog token is absent', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		const { getPublicEnv } = await importEnv();

		expect(getPublicEnv().posthogProjectToken).toBeUndefined();
	});

	test('treats empty-string optional PostHog token as absent', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = '';
		const { getPublicEnv, serializePublicRuntimeEnv } = await importEnv();

		expect(getPublicEnv().posthogProjectToken).toBeUndefined();
		expect(JSON.parse(serializePublicRuntimeEnv())).toEqual({
			PUBLIC_API_BASE_URL: 'https://public.example.test',
		});
	});

	test('serializes all defined public values by their wire keys', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = 'project-token';
		process.env.SERVER_API_BASE_URL = 'http://api:5000';
		process.env.NODE_ENV = 'production';
		const { serializePublicRuntimeEnv } = await importEnv();

		const payload = serializePublicRuntimeEnv();

		expect(JSON.parse(payload)).toEqual({
			PUBLIC_API_BASE_URL: 'https://public.example.test',
			PUBLIC_POSTHOG_PROJECT_TOKEN: 'project-token',
		});
		expect(payload).not.toContain('SERVER_API_BASE_URL');
		expect(payload).not.toContain('NODE_ENV');
	});

	test('omits undefined optional public values from the serialized payload', async () => {
		process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
		const { serializePublicRuntimeEnv } = await importEnv();

		expect(JSON.parse(serializePublicRuntimeEnv())).toEqual({
			PUBLIC_API_BASE_URL: 'https://public.example.test',
		});
	});

	test('escapes less-than characters in the serialized payload', async () => {
		process.env.PUBLIC_API_BASE_URL =
			'https://public.example.test/</script><script>alert(1)</script>';
		const { serializePublicRuntimeEnv } = await importEnv();

		const payload = serializePublicRuntimeEnv();

		expect(payload).not.toContain('<');
		expect(payload).not.toContain('</script>');
		expect(payload).toContain('\\u003c/script>');
	});

	describe('PUBLIC_ORIGIN trailing-path guard', () => {
		// PUBLIC_ORIGIN must be a bare scheme+host (no trailing path). A trailing
		// segment — including the bare `/` of https://example.com/ — corrupts
		// canonical URL construction (${origin}${requestPath} → //path) and is
		// rejected at parse time.
		test('accepts a bare scheme+host', async () => {
			process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
			process.env.SERVER_API_BASE_URL = 'http://api:5000';
			process.env.PUBLIC_ORIGIN = 'https://publyapp.com';
			const { getServerEnv } = await importEnv();

			expect(getServerEnv().publicOrigin).toBe('https://publyapp.com');
		});

		test('rejects a bare trailing slash (path of "/")', async () => {
			process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
			process.env.SERVER_API_BASE_URL = 'http://api:5000';
			process.env.PUBLIC_ORIGIN = 'https://publyapp.com/';
			const { getServerEnv } = await importEnv();

			expect(() => getServerEnv()).toThrow(
				/failed to validate front server runtime env:.*PUBLIC_ORIGIN/,
			);
		});

		test('rejects a PUBLIC_ORIGIN with a non-empty path', async () => {
			process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
			process.env.SERVER_API_BASE_URL = 'http://api:5000';
			process.env.PUBLIC_ORIGIN = 'https://publyapp.com/app';
			const { getServerEnv } = await importEnv();

			expect(() => getServerEnv()).toThrow(
				/failed to validate front server runtime env:.*PUBLIC_ORIGIN/,
			);
		});

		test('rejects a PUBLIC_ORIGIN with a query string', async () => {
			process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
			process.env.SERVER_API_BASE_URL = 'http://api:5000';
			process.env.PUBLIC_ORIGIN = 'https://publyapp.com?x=1';
			const { getServerEnv } = await importEnv();

			expect(() => getServerEnv()).toThrow(
				/failed to validate front server runtime env:.*PUBLIC_ORIGIN/,
			);
		});

		test('rejects a PUBLIC_ORIGIN with a hash', async () => {
			process.env.PUBLIC_API_BASE_URL = 'https://public.example.test';
			process.env.SERVER_API_BASE_URL = 'http://api:5000';
			process.env.PUBLIC_ORIGIN = 'https://publyapp.com#section';
			const { getServerEnv } = await importEnv();

			expect(() => getServerEnv()).toThrow(
				/failed to validate front server runtime env:.*PUBLIC_ORIGIN/,
			);
		});
	});
});

describe('dead PostHog env var guard', () => {
	// The frontend reads the PostHog project token only through
	// PUBLIC_POSTHOG_PROJECT_TOKEN (fallback POSTHOG_PROJECT_TOKEN). The
	// VITE_POSTHOG_PROJECT_TOKEN key is dead config and must never reappear in
	// tracked files. docs/records/** bodies are intentionally exempt because
	// they capture point-in-time state.
	const trackedFiles = execSync('git ls-files', {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.filter((line) => line.length > 0)
		.filter((line) => !line.startsWith('docs/records/'))
		// This test file legitimately names the dead var to assert its absence
		// elsewhere; it must not flag itself.
		.filter((line) => line !== 'apps/front/src/lib/env.test.ts');

	test('no tracked non-record file references the dead VITE_POSTHOG_PROJECT_TOKEN', () => {
		const offenders: string[] = [];

		for (const file of trackedFiles) {
			const content = readFileSync(`${REPO_ROOT}${file}`, 'utf8');
			if (content.includes(DEAD_ENV_VAR)) {
				offenders.push(file);
			}
		}

		expect(offenders, `found dead env var in: ${offenders.join(', ')}`).toEqual(
			[],
		);
	});
});
