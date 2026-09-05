import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { API_BASE_URL } from './api';

export type TenantAccountFixture = {
	tenantId: string;
	email: string;
	password: string;
	staffToken: string;
};

type InvitationTokenLookup = {
	composeFile: string;
	composeProjectName: string;
	tenantId: string;
	email: string;
};

type TenantFixtureCleanup = InvitationTokenLookup;

type CommandResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

export type CommandRunner = (
	command: string,
	args: readonly string[],
) => CommandResult;

export type PersistedTenantIdLookup = {
	composeFile: string;
	composeProjectName: string;
	email: string;
};

export type TenantFixtureCleanupOptions = {
	tenantAlreadyDeleted?: boolean;
	commandRunner?: CommandRunner;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TENANT_INVITATION_SCOPE = 1;
const PENDING_INVITATION_STATUS = 0;
const TENANT_FIXTURE_DATABASE_CLEANUP_TIMEOUT_MS = 10_000;

const sqlStringLiteral = (value: string): string =>
	`'${value.replaceAll("'", "''")}'`;

const buildLookupSql = (tenantId: string, email: string): string => `
SELECT token
FROM invitations
WHERE tenant_id = ${sqlStringLiteral(tenantId)}::uuid
  AND lower(email) = lower(${sqlStringLiteral(email.trim().toLowerCase())})
  AND scope = ${TENANT_INVITATION_SCOPE}
  AND project_id IS NULL
  AND status = ${PENDING_INVITATION_STATUS}
  AND is_deleted = false;
`;

const buildCleanupSql = (tenantId: string, email: string): string => {
	const tenant = sqlStringLiteral(tenantId);
	const invitedEmail = sqlStringLiteral(email.trim().toLowerCase());

	return `
BEGIN;
UPDATE tenants
SET status = 30,
    is_deleted = true,
    deleted_at = COALESCE(deleted_at, NOW()),
    updated_at = NOW()
WHERE id = ${tenant}::uuid;
DELETE FROM invitation_email_outbox
WHERE invitation_id IN (
  SELECT id FROM invitations
  WHERE tenant_id = ${tenant}::uuid OR lower(email) = lower(${invitedEmail})
)
OR lower(email) = lower(${invitedEmail});
DELETE FROM invitation_profiles
WHERE invitation_id IN (
  SELECT id FROM invitations
  WHERE tenant_id = ${tenant}::uuid OR lower(email) = lower(${invitedEmail})
);
DELETE FROM invitations
WHERE tenant_id = ${tenant}::uuid OR lower(email) = lower(${invitedEmail});
DELETE FROM sessions
WHERE user_id IN (
  SELECT id FROM users WHERE lower(email) = lower(${invitedEmail})
);
DELETE FROM user_account_profiles
WHERE user_account_id IN (
  SELECT id FROM user_accounts
  WHERE tenant_id = ${tenant}::uuid
     OR user_id IN (
       SELECT id FROM users WHERE lower(email) = lower(${invitedEmail})
     )
);
DELETE FROM user_accounts
WHERE tenant_id = ${tenant}::uuid
   OR user_id IN (
     SELECT id FROM users WHERE lower(email) = lower(${invitedEmail})
   );
DELETE FROM users
WHERE lower(email) = lower(${invitedEmail});
COMMIT;
`;
};

const buildPersistedTenantIdLookupSql = (email: string): string => {
	const invitedEmail = sqlStringLiteral(email.trim().toLowerCase());

	return `
SELECT DISTINCT tenant_id::text
FROM (
  SELECT tenant_id
  FROM invitations
  WHERE lower(email) = lower(${invitedEmail})
    AND scope = ${TENANT_INVITATION_SCOPE}
    AND project_id IS NULL
    AND tenant_id IS NOT NULL
    AND is_deleted = false
  UNION
  SELECT tenant_id
  FROM user_accounts
  WHERE tenant_id IS NOT NULL
    AND user_id IN (
      SELECT id FROM users WHERE lower(email) = lower(${invitedEmail})
    )
) AS fixture_tenants;
`;
};

const runComposePsql: CommandRunner = (_command, args) => {
	const result = spawnSync('docker', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: TENANT_FIXTURE_DATABASE_CLEANUP_TIMEOUT_MS,
	});

	return {
		status: result.status,
		stdout: typeof result.stdout === 'string' ? result.stdout : '',
		stderr: typeof result.stderr === 'string' ? result.stderr : '',
	};
};

export const validateTenantAccountFixtureInput = (
	tenantId: string,
	email: string,
): void => {
	if (
		!UUID_PATTERN.test(tenantId) ||
		/^0+$/.test(tenantId.replaceAll('-', ''))
	) {
		throw new Error('Tenant fixture returned an invalid tenant id');
	}

	const normalizedEmail = email.trim().toLowerCase();
	if (!EMAIL_PATTERN.test(normalizedEmail)) {
		throw new Error('Tenant fixture generated an invalid invited email');
	}
};

export const buildInvitationTokenLookupArgs = ({
	composeFile,
	composeProjectName,
	tenantId,
	email,
}: InvitationTokenLookup): string[] => [
	'compose',
	'--project-name',
	composeProjectName,
	'-f',
	composeFile,
	'exec',
	'-T',
	'postgres',
	'psql',
	'-U',
	'postgres',
	'-d',
	'publyapp_db',
	'-At',
	'-c',
	buildLookupSql(tenantId, email),
];

export const buildTenantFixtureCleanupArgs = ({
	composeFile,
	composeProjectName,
	tenantId,
	email,
}: TenantFixtureCleanup): string[] => [
	'compose',
	'--project-name',
	composeProjectName,
	'-f',
	composeFile,
	'exec',
	'-T',
	'postgres',
	'psql',
	'-U',
	'postgres',
	'-d',
	'publyapp_db',
	'-v',
	'ON_ERROR_STOP=1',
	'-c',
	buildCleanupSql(tenantId, email),
];

export const buildPersistedTenantIdLookupArgs = ({
	composeFile,
	composeProjectName,
	email,
}: PersistedTenantIdLookup): string[] => [
	'compose',
	'--project-name',
	composeProjectName,
	'-f',
	composeFile,
	'exec',
	'-T',
	'postgres',
	'psql',
	'-U',
	'postgres',
	'-d',
	'publyapp_db',
	'-At',
	'-c',
	buildPersistedTenantIdLookupSql(email),
];

export const parseInvitationTokenLookupOutput = (output: string): string => {
	const tokens = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (tokens.length !== 1 || /\s/.test(tokens[0] ?? '')) {
		throw new Error(
			'Compose query did not return exactly one pending tenant invitation token',
		);
	}

	return tokens[0];
};

export const readPendingTenantInvitationToken = (
	lookup: InvitationTokenLookup,
	runner: CommandRunner = runComposePsql,
): string => {
	validateTenantAccountFixtureInput(lookup.tenantId, lookup.email);

	const result = runner('docker', buildInvitationTokenLookupArgs(lookup));
	if (result.status !== 0) {
		throw new Error(
			'Fixture could not read the invitation token from Compose Postgres',
		);
	}

	try {
		return parseInvitationTokenLookupOutput(result.stdout);
	} catch {
		throw new Error(
			'Fixture could not read the invitation token: expected exactly one pending tenant invitation',
		);
	}
};

export const parsePersistedTenantIdLookupOutput = (
	output: string,
): string | undefined => {
	const tenantIds = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (tenantIds.length === 0) {
		return undefined;
	}
	if (tenantIds.length !== 1 || !UUID_PATTERN.test(tenantIds[0] ?? '')) {
		throw new Error(
			'Compose query did not return exactly one persisted tenant id',
		);
	}

	return tenantIds[0];
};

export const readPersistedTenantIdByFixtureEmail = (
	lookup: PersistedTenantIdLookup,
	runner: CommandRunner = runComposePsql,
): string | undefined => {
	const normalizedEmail = lookup.email.trim().toLowerCase();
	if (!EMAIL_PATTERN.test(normalizedEmail)) {
		throw new Error('Tenant fixture generated an invalid invited email');
	}

	const result = runner('docker', buildPersistedTenantIdLookupArgs(lookup));
	if (result.status !== 0) {
		throw new Error(
			'Fixture could not look up the persisted tenant by invited email',
		);
	}

	return parsePersistedTenantIdLookupOutput(result.stdout);
};

type JsonObject = Record<string, unknown>;

const readJson = async (response: {
	json(): Promise<JsonObject | null>;
}): Promise<JsonObject | undefined> => {
	try {
		const payload = await response.json();
		if (payload === null || Array.isArray(payload)) {
			return undefined;
		}
		return payload as JsonObject;
	} catch {
		return undefined;
	}
};

const readStringField = (
	payload: JsonObject | undefined,
	field: string,
): string | undefined => {
	if (!payload) {
		return undefined;
	}

	const value = payload[field];
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	return trimmed;
};

const assertStatus = (
	actual: number,
	expected: number,
	operation: string,
): void => {
	if (actual !== expected) {
		throw new Error(`Tenant account fixture ${operation} failed`);
	}
};

const assertCleanupStatus = (actual: number, operation: string): void => {
	if (actual !== 200 && actual !== 400 && actual !== 404 && actual !== 409) {
		throw new Error(`Tenant account fixture ${operation} failed`);
	}
};

export const TENANT_FIXTURE_CLEANUP_REQUEST_TIMEOUT_MS = 5_000;

export const buildTenantFixtureCleanupRequestOptions = (
	staffToken: string,
	includeEmptyBody = false,
) => {
	const headers = { 'X-Session-Token': staffToken };
	if (includeEmptyBody) {
		return {
			headers,
			data: {},
			timeout: TENANT_FIXTURE_CLEANUP_REQUEST_TIMEOUT_MS,
		};
	}
	return {
		headers,
		timeout: TENANT_FIXTURE_CLEANUP_REQUEST_TIMEOUT_MS,
	};
};

const staffEmail =
	process.env.E2E_STAFF_ADMIN_EMAIL ?? 'staff-admin@example.com';
const staffPassword =
	process.env.E2E_STAFF_ADMIN_PASSWORD ?? 'ChangeMe123!@3#lol';
const defaultComposeFile = fileURLToPath(
	new URL('../../docker-compose.test.yml', import.meta.url),
);

export const createTenantAccountFixture = async (
	page: Page,
): Promise<TenantAccountFixture> => {
	const email = `e2e-1611-${randomUUID()}@example.test`;
	const password = `E2E-1611-${randomUUID()}-Aa1!`;
	let staffToken: string | undefined;
	let tenantId: string | undefined;
	let tenantCreationAccepted = false;

	try {
		const loginResponse = await page.request.post(
			`${API_BASE_URL}/auth/login`,
			{
				data: { email: staffEmail, password: staffPassword },
			},
		);
		assertStatus(loginResponse.status(), 200, 'staff login');
		const loginPayload = await readJson(loginResponse);
		staffToken = readStringField(loginPayload, 'sessionToken');
		if (!staffToken) {
			throw new Error(
				'Tenant account fixture staff login returned no session token',
			);
		}

		const tenantResponse = await page.request.post(
			`${API_BASE_URL}/staff/tenants/`,
			{
				headers: { 'X-Session-Token': staffToken },
				data: {
					name: `#1611 deleted picker ${randomUUID()}`,
					maxUsers: 2,
					seedDefaultProfile: false,
					initialUsers: [{ email, accountLevel: 'Admin' }],
				},
			},
		);
		tenantCreationAccepted = tenantResponse.status() === 201;
		assertStatus(tenantResponse.status(), 201, 'tenant creation');
		const tenantPayload = await readJson(tenantResponse);
		const returnedTenantId = readStringField(tenantPayload, 'id');
		if (!returnedTenantId) {
			throw new Error(
				'Tenant account fixture tenant creation returned no tenant id',
			);
		}
		validateTenantAccountFixtureInput(returnedTenantId, email);
		tenantId = returnedTenantId;

		const invitationToken = readPendingTenantInvitationToken({
			composeFile: process.env.E2E_COMPOSE_FILE ?? defaultComposeFile,
			composeProjectName: process.env.COMPOSE_PROJECT_NAME ?? 'publyapp-e2e',
			tenantId,
			email,
		});

		const acceptResponse = await page.request.post(
			`${API_BASE_URL}/invitations/${encodeURIComponent(invitationToken)}/accept`,
			{
				data: {
					firstName: 'Issue',
					lastName: '1611',
					password,
				},
			},
		);
		assertStatus(acceptResponse.status(), 200, 'tenant invitation acceptance');

		return { tenantId, email, password, staffToken };
	} catch (error) {
		if (!staffToken) {
			throw error;
		}

		let lookupError: unknown;
		if (!tenantId && tenantCreationAccepted) {
			try {
				tenantId = readPersistedTenantIdByFixtureEmail({
					composeFile: process.env.E2E_COMPOSE_FILE ?? defaultComposeFile,
					composeProjectName:
						process.env.COMPOSE_PROJECT_NAME ?? 'publyapp-e2e',
					email,
				});
			} catch (lookupFailure) {
				lookupError = lookupFailure;
			}
		}

		if (!tenantId) {
			if (lookupError) {
				throw new AggregateError(
					[error, lookupError],
					'Tenant account fixture setup and persisted-tenant lookup failed',
				);
			}
			throw error;
		}

		try {
			await cleanupTenantAccountFixture(page, {
				tenantId,
				email,
				password,
				staffToken,
			});
		} catch (cleanupError) {
			const errors = lookupError
				? [error, lookupError, cleanupError]
				: [error, cleanupError];
			throw new AggregateError(
				errors,
				'Tenant account fixture setup and cleanup failed',
			);
		}
		if (lookupError) {
			throw new AggregateError(
				[error, lookupError],
				'Tenant account fixture setup and persisted-tenant lookup failed',
			);
		}

		throw error;
	}
};

/**
 * Cleans up both halves of the fixture. The API calls are intentionally
 * idempotent: a test may already have suspended/deleted the tenant before an
 * assertion fails, while setup can fail after only the tenant was created.
 * The SQL pass removes the random user and its tenant membership even after
 * the tenant has been soft-deleted and is no longer addressable through the
 * staff tenant-user endpoints.
 */
export const cleanupTenantAccountFixture = async (
	page: Page,
	fixture: TenantAccountFixture,
	options: TenantFixtureCleanupOptions = {},
): Promise<void> => {
	validateTenantAccountFixtureInput(fixture.tenantId, fixture.email);

	let apiError: unknown;
	if (!options.tenantAlreadyDeleted) {
		try {
			const suspendResponse = await page.request.post(
				`${API_BASE_URL}/staff/tenants/${fixture.tenantId}/suspend`,
				buildTenantFixtureCleanupRequestOptions(fixture.staffToken, true),
			);
			assertCleanupStatus(
				suspendResponse.status(),
				'tenant suspension cleanup',
			);

			const deleteResponse = await page.request.delete(
				`${API_BASE_URL}/staff/tenants/${fixture.tenantId}`,
				buildTenantFixtureCleanupRequestOptions(fixture.staffToken),
			);
			assertCleanupStatus(deleteResponse.status(), 'tenant deletion cleanup');
		} catch (error) {
			apiError = error;
		}
	}

	let databaseError: Error | undefined;
	try {
		const result = (options.commandRunner ?? runComposePsql)(
			'docker',
			buildTenantFixtureCleanupArgs({
				composeFile: process.env.E2E_COMPOSE_FILE ?? defaultComposeFile,
				composeProjectName: process.env.COMPOSE_PROJECT_NAME ?? 'publyapp-e2e',
				tenantId: fixture.tenantId,
				email: fixture.email,
			}),
		);
		if (result.status !== 0) {
			databaseError = new Error(
				'Tenant account fixture database cleanup failed',
			);
		}
	} catch (error) {
		databaseError =
			error instanceof Error
				? error
				: new Error('Tenant account fixture database cleanup failed');
	}

	if (apiError && databaseError) {
		throw new AggregateError(
			[apiError, databaseError],
			'Tenant account fixture cleanup failed',
		);
	}
	if (apiError) {
		throw apiError;
	}
	if (databaseError) {
		throw databaseError;
	}
};
