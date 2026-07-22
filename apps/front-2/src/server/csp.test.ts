import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	apiOrigin: undefined as string | undefined,
}));

vi.mock('../lib/env', () => ({
	getPublicEnv: () => {
		if (mocks.apiOrigin === undefined) {
			throw new Error('failed to validate front-2 public runtime env');
		}

		return { apiBaseUrl: mocks.apiOrigin };
	},
}));

import { applyCspHeaders, mintCspNonce } from './csp';

describe('applyCspHeaders', () => {
	beforeEach(() => {
		mocks.apiOrigin = 'https://api.example.test';
	});

	test('folds the API origin into connect-src via the shared builder, not a hand-rolled parser (r3-shell-F9)', () => {
		mocks.apiOrigin = 'https://api.example.test/v1';
		const headers = new Headers();
		const nonce = mintCspNonce();

		applyCspHeaders(headers, nonce, false);

		const policy = headers.get('Content-Security-Policy');
		expect(policy).toBeTruthy();
		const connectSrc = policy
			?.split(';')
			.map((directive) => directive.trim())
			.find((directive) => directive.startsWith('connect-src'));
		expect(connectSrc).toContain('https://api.example.test');
	});

	test('carries the nonce in script-src and never emits a second, report-only copy of the policy', () => {
		const headers = new Headers();
		const nonce = mintCspNonce();

		applyCspHeaders(headers, nonce, false);

		const policy = headers.get('Content-Security-Policy');
		expect(policy).toContain(`'nonce-${nonce}'`);
		expect(headers.has('Content-Security-Policy-Report-Only')).toBe(false);
	});

	test("never lets 'unsafe-inline'/'unsafe-eval' reach script-src outside development", () => {
		const headers = new Headers();

		applyCspHeaders(headers, mintCspNonce(), false);

		const policy = headers.get('Content-Security-Policy');
		const scriptSrc = policy
			?.split(';')
			.map((directive) => directive.trim())
			.find((directive) => directive.startsWith('script-src'));
		expect(scriptSrc).not.toContain("'unsafe-inline'");
		expect(scriptSrc).not.toContain("'unsafe-eval'");
	});

	test('throws when the required public API origin is not configured', () => {
		mocks.apiOrigin = undefined;
		const headers = new Headers();

		expect(() => applyCspHeaders(headers, mintCspNonce(), false)).toThrow(
			'failed to validate front-2 public runtime env',
		);
	});
});
