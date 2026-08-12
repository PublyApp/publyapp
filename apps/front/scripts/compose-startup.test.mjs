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

test('frontend E2E Compose gates startup on authenticated PostgreSQL SQL readiness', () => {
	const compose = parse(readFileSync(composePath, 'utf8'));
	const services = compose.services;
	const postgresHealthcheck = services.postgres.healthcheck;
	const healthCommand = postgresHealthcheck.test;

	assert.ok(Array.isArray(healthCommand));
	assert.equal(healthCommand[0], 'CMD-SHELL');
	assert.equal(typeof healthCommand[1], 'string');
	assert.match(healthCommand[1], /PGPASSWORD="\$\$\{POSTGRES_PASSWORD\}"/);
	assert.match(healthCommand[1], /\bpsql\b/);
	assert.match(healthCommand[1], /-h 127\.0\.0\.1/);
	assert.match(healthCommand[1], /-U "\$\$\{POSTGRES_USER\}"/);
	assert.match(healthCommand[1], /-d "\$\$\{POSTGRES_DB\}"/);
	assert.match(healthCommand[1], /SELECT 1/);

	assert.equal(
		services.migrate.depends_on.postgres.condition,
		'service_healthy',
	);
	assert.equal(
		services.api.depends_on.migrate.condition,
		'service_completed_successfully',
	);
});
