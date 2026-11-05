import { describe, expect, it } from 'vitest';

import { migrationFailureMessage } from './dev-migrate.ts';
import {
	isCurrentAppHost,
	issueBranchName,
	parseRef,
	worktreeDirName,
} from './dev.ts';

describe('parseRef', () => {
	it('returns none without a ref', () => {
		expect(parseRef('')).toEqual({ kind: 'none' });
	});
	it('reads a number, with or without #', () => {
		expect(parseRef('2297')).toEqual({ kind: 'number', number: 2297 });
		expect(parseRef('#2297')).toEqual({ kind: 'number', number: 2297 });
	});
	it('treats anything else as a branch', () => {
		expect(parseRef('feat/2172-renditions-api')).toEqual({
			kind: 'branch',
			branch: 'feat/2172-renditions-api',
		});
	});
});

describe('worktreeDirName', () => {
	it('keeps the part after the type prefix', () => {
		expect(worktreeDirName('feat/2172-renditions-api')).toBe(
			'2172-renditions-api',
		);
	});
	it('flattens deeper slashes and keeps plain names', () => {
		expect(worktreeDirName('chore/deps/fixes')).toBe('deps-fixes');
		expect(worktreeDirName('develop')).toBe('develop');
	});
});

describe('issueBranchName', () => {
	it('builds feat/<n>-<slug> from the title', () => {
		expect(
			issueBranchName(
				2305,
				'Une seule commande just dev et ménage du justfile',
				[],
			),
		).toBe('feat/2305-une-seule-commande-just-dev-et-menage-du-justfile');
	});
	it('uses fix/ when the issue carries the bug label', () => {
		expect(issueBranchName(12, 'Login crash!', ['bug'])).toBe(
			'fix/12-login-crash',
		);
	});
	it('caps the slug at 50 characters without a trailing dash', () => {
		const name = issueBranchName(1, 'a '.repeat(60), []);
		expect(name.length).toBeLessThanOrEqual('feat/1-'.length + 50);
		expect(name.endsWith('-')).toBe(false);
	});
});

describe('isCurrentAppHost', () => {
	it('accepts an AppHost that starts the front with pnpm without auto-install', () => {
		expect(
			isCurrentAppHost(
				'builder.AddViteApp("front", "../front", "dev")\n.WithPnpm(install: false)',
			),
		).toBe(true);
	});
	it('refuses an older AppHost', () => {
		expect(
			isCurrentAppHost('builder.AddViteApp("front", "../front", "dev")'),
		).toBe(false);
	});
});

describe('migrationFailureMessage', () => {
	const ef = [
		"Applying migration '20261102152047_RemoveAccountLevel'.",
		'Npgsql.PostgresException (0x80004005): 42703: column "level" does not exist',
		'   at Npgsql.Internal.NpgsqlConnector.ReadMessageLong(...)',
	].join('\n');

	it('names the failing migration, explains why, quotes the Postgres error, then the reset', () => {
		const message = migrationFailureMessage(
			['20261102152047_RemoveAccountLevel'],
			ef,
		);
		expect(message).toContain('20261102152047_RemoveAccountLevel');
		expect(message).toContain('propre à ce dossier');
		expect(message).toContain('42703: column "level" does not exist');
		expect(message).toContain('just db-reset');
		expect(message).toContain('efface toutes les données locales');
		expect(message.indexOf('propre à ce dossier')).toBeLessThan(
			message.indexOf('just db-reset'),
		);
	});

	it('never echoes a connection string', () => {
		const message = migrationFailureMessage(
			[],
			`${ef}\nHost=localhost;Password=secret`,
		);
		expect(message).not.toContain('Password=');
	});
});
