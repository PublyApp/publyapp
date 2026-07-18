import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findMigrationExpandContractIssues } from './check-migration-expand-contract.mjs';

const migrationTemplate = (upMethodBody) => `using Microsoft.EntityFrameworkCore.Migrations;

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

const buildFixture = async ({ fileName, upMethodBody }) => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-migration-expand-contract-'));
	const migrationFile = path.join(rootDir, 'apps', 'api', 'Migrations');
	await mkdir(migrationFile, { recursive: true });
	await writeFile(
		path.join(migrationFile, `${fileName}.cs`),
		migrationTemplate(upMethodBody),
	);

	return path.join(migrationFile, `${fileName}.cs`);
};

const countBySeverity = (findings, level) =>
	findings.filter((finding) => finding.level === level).length;

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
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 1);
	assert.equal(findings[0].operation, 'AlterColumn');
	assert.match(findings[0].explanation, /type in place/);
});

test('downgrades findings to warnings when expand-contract-ok marker is present', async () => {
	const migrationPath = await buildFixture({
		fileName: '20270001000008_MarkedMigration',
		upMethodBody: `
            // expand-contract-ok: staged rollout after release gate
            migrationBuilder.DropTable(
                name: "legacy_temp");
            migrationBuilder.AddColumn<int>(
                name: "legacy_id",
                table: "users",
                type: "integer",
                nullable: false);`,
	});

	const findings = await findMigrationExpandContractIssues({
		migrationFilePaths: [migrationPath],
	});

	assert.equal(countBySeverity(findings, 'error'), 0);
	assert.equal(countBySeverity(findings, 'warning'), 2);
});
