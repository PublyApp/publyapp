import { describe, expect, it } from 'vitest';

import { SERVICES, containerIsReady } from './ci-e2e-wait-health.ts';

describe('ci-e2e-wait-health', () => {
	it('requires every service of the stack before Playwright runs', () => {
		expect([...SERVICES]).toEqual([
			'front',
			'api',
			'request-counter',
			'traefik',
			'toxiproxy',
			'postgres',
		]);
	});

	it('accepts a running container with a healthy or absent healthcheck', () => {
		expect(containerIsReady('running', 'healthy')).toBe(true);
		expect(containerIsReady('running', 'no-healthcheck')).toBe(true);
	});

	it('rejects a starting/unhealthy container and a stopped one', () => {
		expect(containerIsReady('running', 'starting')).toBe(false);
		expect(containerIsReady('running', 'unhealthy')).toBe(false);
		expect(containerIsReady('exited', 'healthy')).toBe(false);
	});
});
