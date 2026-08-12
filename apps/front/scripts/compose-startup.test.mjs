import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..', '..', '..');
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

export const assertComposeStartupContract = (compose) => {
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
};

test('frontend E2E Compose gates startup on authenticated PostgreSQL SQL readiness', () => {
	assertComposeStartupContract(parse(readFileSync(composePath, 'utf8')));
});

test('contract rejects a healthcheck mutation that can hide SQL failure', () => {
	const compose = parse(readFileSync(composePath, 'utf8'));
	compose.services.postgres.healthcheck.test[1] =
		'PGPASSWORD="$${POSTGRES_PASSWORD}" psql -h 127.0.0.1 -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}" -tAc \'SELECT 1\' || true';

	assert.throws(() => assertComposeStartupContract(compose), /healthcheck/);
});

test('contract rejects a dependency-condition mutation that races migration', () => {
	const compose = parse(readFileSync(composePath, 'utf8'));
	compose.services.migrate.depends_on.postgres.condition = 'service_started';

	assert.throws(() => assertComposeStartupContract(compose), /service_healthy/);
});
