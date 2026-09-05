import { describe, expect, test } from 'vitest';

import {
	buildInvitationTokenLookupArgs,
	buildTenantFixtureCleanupArgs,
	parseInvitationTokenLookupOutput,
	readPendingTenantInvitationToken,
	validateTenantAccountFixtureInput,
} from './tenant-account-fixture';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'e2e-1611@example.test';

describe('tenant account fixture', () => {
	test('validates the tenant UUID and normalized unique email before querying', () => {
		expect(() =>
			validateTenantAccountFixtureInput(TENANT_ID, EMAIL),
		).not.toThrow();
		expect(() =>
			validateTenantAccountFixtureInput('not-a-uuid', EMAIL),
		).toThrow('Tenant fixture returned an invalid tenant id');
		expect(() =>
			validateTenantAccountFixtureInput(TENANT_ID, 'not-an-email'),
		).toThrow('Tenant fixture generated an invalid invited email');
	});

	test('builds a shell-free Compose argv query scoped to one tenant invitation', () => {
		const args = buildInvitationTokenLookupArgs({
			composeFile: 'apps/front/docker-compose.test.yml',
			composeProjectName: 'publyapp-e2e-1611',
			tenantId: TENANT_ID,
			email: `  ${EMAIL.toUpperCase()}  `,
		});

		expect(args).toEqual([
			'compose',
			'--project-name',
			'publyapp-e2e-1611',
			'-f',
			'apps/front/docker-compose.test.yml',
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
			expect.stringContaining(`tenant_id = '${TENANT_ID}'::uuid`),
		]);
		expect(args.at(-1)).toEqual(
			expect.stringContaining(`lower(email) = lower('${EMAIL}')`),
		);
		expect(args.at(-1)).toEqual(expect.stringContaining('scope = 1'));
		expect(args.at(-1)).toEqual(expect.stringContaining('project_id IS NULL'));
		expect(args.at(-1)).toEqual(expect.stringContaining('status = 0'));
		expect(args.at(-1)).toEqual(expect.stringContaining('is_deleted = false'));
		expect(args).not.toContain(expect.stringContaining('sh -c'));

		const emailWithQuote = "fixture.o'quote@example.test";
		const escapedArgs = buildInvitationTokenLookupArgs({
			composeFile: 'apps/front/docker-compose.test.yml',
			composeProjectName: 'publyapp-e2e-1611',
			tenantId: TENANT_ID,
			email: emailWithQuote,
		});
		expect(escapedArgs.at(-1)).toEqual(
			expect.stringContaining("lower('fixture.o''quote@example.test')"),
		);
	});

	test('accepts exactly one non-empty token and rejects empty or ambiguous output', () => {
		expect(parseInvitationTokenLookupOutput('token-value\n')).toBe(
			'token-value',
		);
		expect(() => parseInvitationTokenLookupOutput('')).toThrow(
			'exactly one pending tenant invitation token',
		);
		expect(() =>
			parseInvitationTokenLookupOutput('token-a\ntoken-b\n'),
		).toThrow('exactly one pending tenant invitation token');
	});

	test('builds cleanup SQL scoped to the throwaway tenant and invited user', () => {
		const args = buildTenantFixtureCleanupArgs({
			composeFile: 'apps/front/docker-compose.test.yml',
			composeProjectName: 'publyapp-e2e-1611',
			tenantId: TENANT_ID,
			email: EMAIL,
		});

		expect(args).toEqual([
			'compose',
			'--project-name',
			'publyapp-e2e-1611',
			'-f',
			'apps/front/docker-compose.test.yml',
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
			expect.stringContaining(`tenant_id = '${TENANT_ID}'::uuid`),
		]);
		expect(args.at(-1)).toEqual(
			expect.stringContaining(`lower(email) = lower('${EMAIL}')`),
		);
		expect(args.at(-1)).toEqual(
			expect.stringContaining('DELETE FROM user_accounts'),
		);
		expect(args.at(-1)).toEqual(expect.stringContaining('UPDATE tenants'));
		expect(args.at(-1)).toEqual(
			expect.stringContaining('DELETE FROM invitations'),
		);
		expect(args.at(-1)).toEqual(expect.stringContaining('DELETE FROM users'));
		expect(args.at(-1)).not.toEqual(expect.stringContaining('sh -c'));
	});

	test('fails without exposing the invitation token or command output', () => {
		const secretToken = 'token-that-must-never-appear';
		const failure = () =>
			readPendingTenantInvitationToken(
				{
					composeFile: 'apps/front/docker-compose.test.yml',
					composeProjectName: 'publyapp-e2e-1611',
					tenantId: TENANT_ID,
					email: EMAIL,
				},
				() => ({ status: 1, stdout: secretToken, stderr: secretToken }),
			);

		let thrown: Error | undefined;
		try {
			failure();
		} catch (error) {
			thrown = error as Error;
		}
		expect(thrown?.message).toContain('could not read the invitation token');
		expect(thrown?.message).not.toContain(secretToken);
	});
});
