import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..', '..', '..', '..');
const composePath = path.join(
	repositoryRoot,
	'apps',
	'front',
	'docker-compose.test.yml',
);

const expectedPostgresHealthcheck = {
	test: [
		'CMD-SHELL',
		'PGPASSWORD="$${POSTGRES_PASSWORD}" psql -h 127.0.0.1 -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" -tAc \'SELECT 1\' | grep -qx 1',
	],
	interval: '5s',
	timeout: '5s',
	retries: 20,
};

/**
 * The subset of apps/front/docker-compose.test.yml this contract pins.
 */
interface ComposeContract {
	services: {
		postgres: {
			healthcheck: {
				test: string[];
				interval: string;
				timeout: string;
				retries: number;
			};
		};
		migrate: { depends_on: { postgres: { condition: string } } };
		api: { depends_on: { migrate: { condition: string } } };
		front: {
			environment: Record<string, string>;
		};
	};
}

/** Parses the compose file into the contract shape. */
const loadCompose = (): ComposeContract =>
	parse(readFileSync(composePath, 'utf8')) as ComposeContract;

const resolveShellDefaults = (value: string): string => {
	// Resolve ${VAR:-default} and ${VAR} shell expansions against process.env,
	// falling back to the `:-` default when the variable is unset. Docker
	// expands these at container start; we replicate that here so the bare-origin
	// URL contract can be validated on the static compose file.
	return value.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
		const [name, defaultSuffix] = expr.split(':-');
		const envValue = process.env[name];
		if (envValue !== undefined && envValue !== '') {
			return envValue;
		}
		return defaultSuffix ?? '';
	});
};

const isBareSchemePlusHost = (rawValue: string): boolean => {
	const value = resolveShellDefaults(rawValue);
	try {
		const url = new URL(value);
		// PUBLIC_ORIGIN is consumed as `${origin}${requestPath}`; a trailing
		// slash, path, query, or fragment corrupts canonical URLs. The schema
		// in src/lib/env.ts enforces the same contract at runtime.
		return (
			url.pathname === '/' &&
			url.search === '' &&
			url.hash === '' &&
			url.origin !== '' &&
			!value.endsWith('/')
		);
	} catch {
		return false;
	}
};

export const assertComposeStartupContract = (
	compose: ComposeContract,
): void => {
	const services = compose.services;
	assert.deepEqual(
		services.postgres.healthcheck,
		expectedPostgresHealthcheck,
		'PostgreSQL healthcheck must remain the authenticated TCP SELECT 1 probe with its timing contract',
	);
	assert.deepEqual(services.migrate.depends_on, {
		postgres: { condition: 'service_healthy' },
	});
	assert.deepEqual(services.api.depends_on.migrate, {
		condition: 'service_completed_successfully',
	});

	// RED without PUBLIC_ORIGIN: the front service runs with NODE_ENV=production,
	// validateRuntimeEnv() refuses to start, the container stops, the e2e health
	// check times out, and all four shards plus the gate fail. GREEN with the
	// declared origin: startup proceeds, so the health check can pass.
	const frontEnv = services.front.environment;
	assert.ok(
		frontEnv !== undefined,
		'front service must declare an environment block',
	);
	assert.ok(
		'PUBLIC_ORIGIN' in frontEnv,
		'front service must define PUBLIC_ORIGIN — without it, validateRuntimeEnv() refuses to start in NODE_ENV=production and the e2e stack times out at health check',
	);
	const publicOrigin = frontEnv.PUBLIC_ORIGIN;
	assert.notEqual(publicOrigin, '', 'PUBLIC_ORIGIN must not be empty');
	assert.ok(
		isBareSchemePlusHost(publicOrigin),
		`PUBLIC_ORIGIN must be a bare scheme+host (e.g. "https://example.com") — no trailing slash, path, query, or fragment. Got: "${publicOrigin}"`,
	);
};

void test('frontend E2E Compose gates startup on authenticated PostgreSQL SQL readiness', () => {
	assertComposeStartupContract(loadCompose());
});

void test('contract rejects a healthcheck mutation that can hide SQL failure', () => {
	const compose = loadCompose();
	compose.services.postgres.healthcheck.test[1] =
		'PGPASSWORD="$${POSTGRES_PASSWORD}" psql -h 127.0.0.1 -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" -tAc \'SELECT 1\' || true';

	assert.throws(() => assertComposeStartupContract(compose), /healthcheck/);
});

void test('contract rejects a dependency-condition mutation that races migration', () => {
	const compose = loadCompose();
	compose.services.migrate.depends_on.postgres.condition = 'service_started';

	assert.throws(() => assertComposeStartupContract(compose), /service_healthy/);
});

void test('contract rejects a PUBLIC_ORIGIN mutation that breaks front startup in production', () => {
	const compose = loadCompose();
	// Absent PUBLIC_ORIGIN: validateRuntimeEnv() refuses to start and e2es time out.
	delete compose.services.front.environment.PUBLIC_ORIGIN;
	assert.throws(() => assertComposeStartupContract(compose), /PUBLIC_ORIGIN/);
});

void test('contract rejects an invalid PUBLIC_ORIGIN (trailing slash)', () => {
	const compose = loadCompose();
	// Trailing slash: rejected by the runtime schema and by our bare-origin contract.
	compose.services.front.environment.PUBLIC_ORIGIN =
		'https://front.localhost:8443/';
	assert.throws(() => assertComposeStartupContract(compose), /PUBLIC_ORIGIN/);
});
