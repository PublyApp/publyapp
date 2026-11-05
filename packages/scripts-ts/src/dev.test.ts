import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { migrationFailureMessage } from './dev-migrate.ts';
import {
	READY_TARGETS,
	dependenciesInstalled,
	installFailureMessage,
	isCurrentAppHost,
	isPublyAppHostCmdline,
	isUnderPath,
	issueBranchName,
	parseRef,
	readinessFailure,
	stopEscalation,
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

describe('isUnderPath', () => {
	const clone = path.join(tmpdir(), 'publyapp');

	it('accepts the clone itself and its worktrees', () => {
		expect(isUnderPath(clone, clone)).toBe(true);
		expect(isUnderPath(path.join(clone, '.worktrees', '2305-x'), clone)).toBe(
			true,
		);
	});

	it('refuses a sibling clone that only shares the prefix', () => {
		expect(
			isUnderPath(path.join(`${clone}-foo`, '.worktrees', '1-x'), clone),
		).toBe(false);
	});

	it('refuses the parent and an unrelated path', () => {
		expect(isUnderPath(path.dirname(clone), clone)).toBe(false);
		expect(isUnderPath(path.join(tmpdir(), 'other', 'publyapp'), clone)).toBe(
			false,
		);
	});
});

describe('dependenciesInstalled', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'dev-gate-'));
	const nodeModules = path.join(root, 'node_modules');
	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('is false for an empty node_modules — a Ctrl+C mid-install', () => {
		mkdirSync(nodeModules, { recursive: true });
		expect(dependenciesInstalled(root)).toBe(false);
	});

	it('is true once pnpm wrote its completion marker', () => {
		writeFileSync(path.join(nodeModules, '.modules.yaml'), '');
		expect(dependenciesInstalled(root)).toBe(true);
	});
});

describe('readiness', () => {
	it('checks both the API and the front — the front used to be unchecked', () => {
		expect(READY_TARGETS.map((target) => target.url)).toEqual([
			'http://127.0.0.1:5000/health',
			'http://127.0.0.1:5050/',
		]);
	});
	it('names the failed target in French', () => {
		const message = readinessFailure(["l'interface (http://127.0.0.1:5050/)"]);
		expect(message).toContain("l'interface (http://127.0.0.1:5050/)");
		expect(message).toContain('ne répond pas');
		expect(message).not.toContain('ne répondent');
	});
	it('names every failed target when both are down', () => {
		const message = readinessFailure(
			READY_TARGETS.map((target) => target.label),
		);
		expect(message).toContain("l'API (http://127.0.0.1:5000/health)");
		expect(message).toContain("l'interface (http://127.0.0.1:5050/)");
		expect(message).toContain('ne répondent pas');
	});
});

describe('stopEscalation', () => {
	it('starts with SIGINT on Ctrl+C, then falls back to SIGTERM', () => {
		expect(stopEscalation('SIGINT').map((step) => step.signal)).toEqual([
			'SIGINT',
			'SIGTERM',
		]);
	});
	it('does not wait for SIGINT when SIGTERM was requested', () => {
		expect(stopEscalation('SIGTERM').map((step) => step.signal)).toEqual([
			'SIGTERM',
		]);
	});
	it('frees the ports within the 60 s the live proof allows', () => {
		let total = 0;
		for (const step of stopEscalation('SIGINT')) {
			total += step.waitMs;
		}
		expect(total).toBeLessThanOrEqual(60_000);
	});
});

describe('isPublyAppHostCmdline', () => {
	it('accepts the built AppHost artifact path', () => {
		expect(
			isPublyAppHostCmdline(
				'dotnet\u0000/apps/apphost/.artifacts/bin/PublyApp.AppHost/Debug/net10.0/PublyApp.AppHost.dll',
			),
		).toBe(true);
	});
	it('refuses the dotnet run launcher and unrelated processes', () => {
		expect(
			isPublyAppHostCmdline('dotnet\u0000run\u0000--project\u0000apps/apphost'),
		).toBe(false);
		expect(
			isPublyAppHostCmdline(
				'node\u0000/apps/front/node_modules/.bin/vite\u0000dev',
			),
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

describe('installFailureMessage', () => {
	it('says the install was interrupted when pnpm died by a signal or exited 130', () => {
		expect(installFailureMessage({ signal: 'SIGINT', status: null })).toContain(
			'interrompue',
		);
		expect(installFailureMessage({ signal: null, status: 130 })).toContain(
			'interrompue',
		);
	});

	it('reports an ordinary failure without claiming an interruption', () => {
		expect(installFailureMessage({ signal: null, status: 1 })).toContain(
			'a échoué',
		);
	});
});
