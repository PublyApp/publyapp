import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	findMigrationExpandContractIssues,
	listMigrationFiles,
} from './check-migration-expand-contract.ts';

const migrationTemplate = (
	// @ts-expect-error rung-0: add proper type in later rung
	upMethodBody,
) => `using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class FixtureMigration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
${upMethodBody}
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
`;

// @ts-expect-error rung-0: add proper type in later rung
const buildFixture = async ({ fileName, upMethodBody }) => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-migration-expand-contract-'),
	);
	const migrationFile = path.join(rootDir, 'apps', 'api', 'Migrations');
	await mkdir(migrationFile, { recursive: true });
	await writeFile(
		path.join(migrationFile, `${fileName}.cs`),
		migrationTemplate(upMethodBody),
	);

	return path.join(migrationFile, `${fileName}.cs`);
};

// @ts-expect-error rung-0: add proper type in later rung
const normalizePath = (value) => value.trim().replace(/\\+/g, '/');
// @ts-expect-error rung-0: add proper type in later rung
const countBySeverity = (findings, level) =>
	// @ts-expect-error rung-0: add proper type in later rung
	findings.filter((finding) => finding.level === level).length;
// @ts-expect-error rung-0: add proper type in later rung
const getFindingByOperation = (findings, operation, level = null) =>
	findings.find(
		// @ts-expect-error rung-0: add proper type in later rung
		(finding) =>
			finding.operation === operation &&
			(level === null || finding.level === level),
	);

test('passes a safe additive migration', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000000_SafeMigration',
		upMethodBody: `
            migrationBuilder.AddColumn<string>(
                name: "email",
                table: "users",
                type: "text",
                nullable: true);`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(findings.length, 0);
});

test('fails on DropColumn in a changed migration', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000001_DropColumn',
		upMethodBody: `
            migrationBuilder.DropColumn(
                name: "old_email",
                table: "users");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.match(findings[0].explanation, /dropping a database object/);
});

test('fails on DropTable in a changed migration', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000002_DropTable',
		upMethodBody: `
            migrationBuilder.DropTable(
                name: "legacy_table");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'DropTable');
});

test('fails on RenameColumn in a changed migration', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000003_RenameColumn',
		upMethodBody: `
            migrationBuilder.RenameColumn(
                name: "old_name",
                table: "users",
                newName: "new_name");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'RenameColumn');
});

test('fails on RenameTable in a changed migration', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000004_RenameTable',
		upMethodBody: `
            migrationBuilder.RenameTable(
                name: "old_table",
                newName: "new_table");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'RenameTable');
});

test('fails when AddColumn is non-nullable without defaults', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000005_AddColumn',
		upMethodBody: `
            migrationBuilder.AddColumn<int>(
                name: "legacy_id",
                table: "users",
                type: "integer",
                nullable: false);`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'AddColumn');
});

test('fails when AlterColumn tightens nullable false', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000006_AlterColumnNullability',
		upMethodBody: `
            migrationBuilder.AlterColumn<string>(
                name: "name",
                table: "users",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'AlterColumn');
	assert.match(findings[0].explanation, /true→false/);
});

test('fails when AlterColumn changes column type', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000007_AlterColumnType',
		upMethodBody: `
            migrationBuilder.AlterColumn<Guid>(
                name: "owner_id",
                table: "projects",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'AlterColumn');
	assert.match(findings[0].explanation, /type in place/);
});

test('bare expand-contract-ok marker does not downgrade; it emits a needs-reason warning', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000008_BareMarker',
		upMethodBody: `
            // expand-contract-ok:
            migrationBuilder.DropColumn(
                name: "old_email",
                table: "users");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(countBySeverity(findings, 'warning'), 1);
	assert.equal(
		// @ts-expect-error rung-0: TS2345
		getFindingByOperation(findings, 'DropColumn', 'error')?.operation,
		'DropColumn',
	);
	assert.match(
		findings.find((finding) => finding.operation === 'expand-contract-ok')
			.explanation,
		/expand-contract-ok marker found with no reason/,
	);
});

test('same-line expand-contract-ok marker downgrades only the marked op', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000009_SameLineMarker',
		upMethodBody: `
            migrationBuilder.DropTable(name: "legacy_temp"); // expand-contract-ok: staged rollout
            migrationBuilder.DropColumn(name: "old_email", table: "users");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(countBySeverity(findings, 'warning'), 1);
	assert.equal(
		// @ts-expect-error rung-0: TS2345
		getFindingByOperation(findings, 'DropTable', 'warning')?.markerReason,
		'staged rollout',
	);
	assert.equal(
		// @ts-expect-error rung-0: TS2345
		getFindingByOperation(findings, 'DropColumn', 'error')?.operation,
		'DropColumn',
	);
});

test('marker applies per-op: one marked op warns while sibling breaking ops still error', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000010_PerOpScope',
		upMethodBody: `
            // expand-contract-ok: rollout after compatibility window
            migrationBuilder.DropTable(
                name: "legacy_temp");
            migrationBuilder.DropColumn(
                name: "legacy_id",
                table: "users");
            migrationBuilder.RenameColumn(
                name: "old_name",
                table: "users",
                newName: "new_name");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 2);
	assert.equal(countBySeverity(findings, 'warning'), 1);
	assert.equal(
		// @ts-expect-error rung-0: TS2345
		getFindingByOperation(findings, 'DropTable', 'warning')?.markerReason,
		'rollout after compatibility window',
	);
	assert.equal(countBySeverity(findings, 'error'), 2);
});

test('flags AddColumn nullable=false with explicit null defaultValue', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000011_NullDefaultAddColumn',
		upMethodBody: `
            migrationBuilder.AddColumn<int>(
                name: "legacy_id",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: null);`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'AddColumn');
});

test('flags AddColumn nullable=false with explicit null defaultValueSql', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000012_NullDefaultSqlAddColumn',
		upMethodBody: `
            migrationBuilder.AddColumn<int>(
                name: "legacy_id",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValueSql: null);`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'AddColumn');
});

test('allows non-nullable AddColumn with a real default', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000013_DefaultAddColumnPass',
		upMethodBody: `
            migrationBuilder.AddColumn<int>(
                name: "legacy_id",
                table: "users",
                type: "integer",
                nullable: false,
                defaultValue: 0);`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(findings.length, 0);
});

test('detects raw SQL DROP COLUMN as breaking', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000014_RawSqlDropColumn',
		upMethodBody: `
            migrationBuilder.Sql(@"ALTER TABLE users DROP COLUMN legacy_id");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'Sql');
	assert.match(findings[0].explanation, /drops a column/);
});

test('passes raw SQL that only adds an index', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000015_RawSqlAddIndex',
		upMethodBody: `
            migrationBuilder.Sql(
                "CREATE INDEX CONCURRENTLY idx_users_email ON users(email);");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(findings.length, 0);
});

test('downgrades raw-SQL breaking SQL with per-op marker', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000016_MarkedRawSql',
		upMethodBody: `
            // expand-contract-ok: phased raw sql cleanup
            migrationBuilder.Sql(@"ALTER TABLE users DROP TABLE legacy_users");`,
	});

	const findings = await findMigrationExpandContractIssues({
		// @ts-expect-error rung-0: TS2353
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 0);
	assert.equal(countBySeverity(findings, 'warning'), 1);
	assert.equal(findings[0].operation, 'Sql');
	assert.equal(findings[0].markerReason, 'phased raw sql cleanup');
});

test('scans newly added migrations and ignores develop-only/deleted entries', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-migration-expand-contract-'),
	);
	const migrationDir = path.join(rootDir, 'apps', 'api', 'Migrations');
	await mkdir(migrationDir, { recursive: true });
	const added = path.join(migrationDir, '20270001000017_AddedByUs.cs');
	await writeFile(added, migrationTemplate(''));

	// @ts-expect-error rung-0: add proper type in later rung
	const runCommand = async (_command, args) => {
		const command = args.join(' ');
		if (command.startsWith('diff --name-only origin/develop')) {
			return {
				stdout: 'apps/api/Migrations/20270001000016_OnlyOnDevelop.cs',
			};
		}

		if (
			command.startsWith(
				'ls-files --others --exclude-standard -- apps/api/Migrations',
			)
		) {
			return { stdout: 'apps/api/Migrations/20270001000017_AddedByUs.cs' };
		}

		throw new Error(`Unexpected git command: ${command}`);
	};

	// @ts-expect-error rung-0: TS2322
	const files = await listMigrationFiles({ rootDir, runCommand });

	assert.equal(files.length, 1);
	assert.equal(files[0], normalizePath(added));
});
