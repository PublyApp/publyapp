import { afterEach, describe, expect, it } from 'vitest';

import {
	getPublicApiBaseUrl,
	getServerApiBaseUrl,
	isProductionRuntime,
} from './env';

type EnvGlobal = typeof globalThis & {
	__ENV__?: {
		PUBLIC_API_BASE_URL?: string;
	};
};

const envKeys = [
	'NODE_ENV',
	'PUBLIC_API_BASE_URL',
	'SERVER_API_BASE_URL',
] as const;

const originalEnv = new Map<string, string | undefined>(
	envKeys.map((key) => [key, process.env[key]]),
);
const envGlobal = globalThis as EnvGlobal;

const resetEnv = (): void => {
	for (const key of envKeys) {
		const originalValue = originalEnv.get(key);

		if (originalValue === undefined) {
			delete process.env[key];
			continue;
		}

		process.env[key] = originalValue;
	}

	delete envGlobal.__ENV__;
};

afterEach(() => {
	resetEnv();
});

describe('front-2 env', () => {
	it('uses the injected browser API base before the process env value', () => {
		process.env.PUBLIC_API_BASE_URL = 'https://process.example.test';
		envGlobal.__ENV__ = {
			PUBLIC_API_BASE_URL: ' https://runtime.example.test ',
		};

		expect(getPublicApiBaseUrl()).toBe('https://runtime.example.test');
	});

	it('reads the server API base from the process env', () => {
		process.env.SERVER_API_BASE_URL = ' http://api:5000 ';

		expect(getServerApiBaseUrl()).toBe('http://api:5000');
	});

	it('fails through the env validator when the public API base is missing', () => {
		delete process.env.PUBLIC_API_BASE_URL;
		delete envGlobal.__ENV__;

		expect(() => getPublicApiBaseUrl()).toThrow(
			'failed to validate front-2 public runtime env',
		);
	});

	it('checks the production runtime flag through the env accessor', () => {
		process.env.NODE_ENV = 'production';

		expect(isProductionRuntime()).toBe(true);
	});
});
